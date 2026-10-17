import {
    ApiConstants,
    CollatedTrain,
    DayTimetable,
    DueTime,
    DueTimesOptions,
    DueTimesResponse,
    GeoApiData,
    HeartbeatErrorsOptions,
    HeartbeatErrorsResponse,
    HeartbeatTimes,
    CreateTokenResponse,
    PlatformCode,
    PlatformDueTimesOptions,
    PlatformDueTimesResponse,
    PropsFilter,
    SnapshotOptions,
    SnapshotResponse,
    StationDueTimesOptions,
    StationDueTimesResponse,
    SubscriptionRequest,
    SubscriptionsChange,
    SubscriptionTokenDetails,
    TimeFilter,
    TimesApiData,
    TimetableOptions,
    TrainOptions,
    TrainResponse,
    TrainsAvailabilityOptions,
    TrainsAvailabilityResponse,
    TrainsHistoryOptions,
    TrainsHistoryResponse,
    TrainsOptions,
    TrainsResponse,
    TrainStatusFilters,
    SubscriptionStreamCallbacks,
    SubscriptionStreamOptions,
} from "./types";
import {createEventSource} from 'eventsource-client'

// --- Serialisation ---

function serialiseProps(props: PropsFilter): string {
    return props.join(',');
}

function serialiseTimeFilter(timeFilter: TimeFilter): string {
    if ('at' in timeFilter) return timeFilter.at.getTime().toString();
    let from = '';
    let to = '';
    if ('from' in timeFilter) from = timeFilter.from.getTime().toString();
    if ('to' in timeFilter) to = timeFilter.to.getTime().toString();
    return `${from}...${to}`;
}

function appendAll(queryParams: URLSearchParams, name: string, values?: readonly (string | number)[]): void {
    for (const value of values ?? []) {
        queryParams.append(name, value.toString());
    }
}

function appendTrainStatusFilters(queryParams: URLSearchParams, filters: TrainStatusFilters): void {
    appendAll(queryParams, 'trn', filters.trns);
    appendAll(queryParams, 'eventType', filters.eventTypes);
    appendAll(queryParams, 'location', filters.locations);
    appendAll(queryParams, 'destination', filters.destinations);
}

// --- Deserialisation ---

function toDate<T extends number | null | undefined>(timestamp: T): T extends number ? Date : T {
    return (
        timestamp === null || timestamp === undefined ? timestamp : new Date(timestamp)
    ) as (T extends number ? Date : T);
}

function deserialiseHeartbeat(heartbeat: any): HeartbeatTimes {
    if (heartbeat) {
        if ('startedAt' in heartbeat) heartbeat.startedAt = toDate(heartbeat.startedAt);
        if ('endedAt' in heartbeat) heartbeat.endedAt = toDate(heartbeat.endedAt);
    }
    return heartbeat;
}

function deserialiseDueTime(time: any): DueTime {
    if (time) {
        if ('actualScheduledTime' in time) time.actualScheduledTime = toDate(time.actualScheduledTime);
        if ('actualPredictedTime' in time) time.actualPredictedTime = toDate(time.actualPredictedTime);
    }
    return time;
}

function deserialiseTimesApiData(data: any): TimesApiData {
    if (data.lastEvent?.time !== undefined) {
        data.lastEvent.time = toDate(data.lastEvent.time);
    }
    for (const plannedDestination of data.plannedDestinations ?? []) {
        if (plannedDestination.from?.time !== undefined) {
            plannedDestination.from.time = toDate(plannedDestination.from.time);
        }
    }
    for (const nextPlatform of data.nextPlatforms ?? []) {
        deserialiseDueTime(nextPlatform.time);
    }
    return data;
}

function deserialiseGeoApiData(data: any): GeoApiData {
    if (typeof data.lastSeen === 'object' && data.lastSeen?.time !== undefined) {
        data.lastSeen.time = toDate(data.lastSeen.time);
    }
    return data;
}

function deserialiseCollatedTrain(train: any): CollatedTrain {
    if (train?.timesAPI) deserialiseTimesApiData(train.timesAPI);
    if (train?.geoAPI) deserialiseGeoApiData(train.geoAPI);
    return train;
}

function deserialiseDueTimes(dueTimes: any[]) {
    for (const dueTime of dueTimes) {
        deserialiseDueTime(dueTime.time);
        if (dueTime.status) deserialiseCollatedTrain(dueTime.status);
    }
    return dueTimes;
}

function deserialiseHistoryEntry(entry: any, deserialiseStatus: (status: any) => unknown) {
    deserialiseHeartbeat(entry.startHeartbeat);
    deserialiseHeartbeat(entry.endHeartbeat);
    deserialiseStatus(entry.status);
}

// --- Client ---

/** An error response from the proxy. */
export class MetroApiError extends Error {
    constructor(
        /** The HTTP status code */
        public readonly status: number,
        /** The error message from the proxy */
        public readonly body: string
    ) {
        super(`${status}: ${body}`);
    }
}

/**
 * A client for the unofficial Tyne and Wear Metro API proxy
 */
export class MetroApiClient {
    constructor(private readonly baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    /** Fetches from the proxy, throwing a `MetroApiError` if it responds with an HTTP error */
    private async request(method: string, path: string, queryParams?: URLSearchParams, body?: unknown): Promise<any> {
        const response = await fetch(`${this.baseUrl}${path}${queryParams?.size ? `?${queryParams}` : ''}`, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) throw new MetroApiError(response.status, await response.text());
        if (response.status === 204) return;
        return response.json();
    }

    /** Fetches from the proxy with a GET request, throwing a `MetroApiError` if it responds with an HTTP error */
    private async get(path: string, queryParams?: URLSearchParams): Promise<any> {
        return this.request('GET', path, queryParams);
    }

    /**
     * Gets various constants used by the proxy (new day hour, refresh intervals, history limits, stations...)
     */
    async getConstants(): Promise<ApiConstants> {
        return this.get('/constants');
    }

    /**
     * Gets the current status of all currently active trains
     * @param opts Options
     */
    async getTrains<Options extends TrainsOptions>(opts?: Options): Promise<TrainsResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
          queryParams.append('props', serialiseProps(opts.props));
        }
        const data = await this.get('/trains', queryParams);

        if (data.lastHeartbeat) deserialiseHeartbeat(data.lastHeartbeat);
        if (data.trains && !Array.isArray(data.trains)) {
            for (const train of Object.values(data.trains) as any[]) {
                if (train.status) deserialiseCollatedTrain(train.status);
                if (train.statusLastChanged) deserialiseHeartbeat(train.statusLastChanged);
            }
        }

        return data;
    }

    /**
     * Gets the current and timetabled status of a train
     * @param trn TRN of the train
     * @param opts Options
     */
    async getTrain<Options extends TrainOptions>(trn: string, opts?: Options): Promise<TrainResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
          queryParams.append('props', serialiseProps(opts.props));
        }
        const data = await this.get(`/train/${encodeURIComponent(trn)}`, queryParams);

        if (data.lastHeartbeat) deserialiseHeartbeat(data.lastHeartbeat);
        if (data.statusLastChangedDuring) deserialiseHeartbeat(data.statusLastChangedDuring);
        if (data.status) deserialiseCollatedTrain(data.status);

        return data;
    }

    /**
     * Gets the TRNs of all trains which have any history, in alphabetical order.
     */
    async getTrnsWithHistory(): Promise<string[]> {
        return this.get('/history/trns');
    }

    /**
     * Gets the history of statuses for one or more trains.
     * Each entry is a period during which a train's status (in one API) stayed the same.
     * @param opts Options
     */
    async getTrainsHistory<const Options extends TrainsHistoryOptions = {}>(
        opts?: Options
    ): Promise<TrainsHistoryResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts) {
            appendTrainStatusFilters(queryParams, opts);
            appendAll(queryParams, 'api', opts.apis);
            if (opts.time) queryParams.append('time', serialiseTimeFilter(opts.time));
            if (opts.limit) queryParams.append('limit', opts.limit.toString());
            if (opts.limitPerTrn) queryParams.append('limitPerTrn', opts.limitPerTrn.toString());
        }

        const data = await this.get('/history/trains', queryParams);

        for (const train of Object.values(data.trains) as any[]) {
            for (const entry of train.timesAPI ?? []) deserialiseHistoryEntry(entry, deserialiseTimesApiData);
            for (const entry of train.geoAPI ?? []) deserialiseHistoryEntry(entry, deserialiseGeoApiData);
        }
        data.truncatedTo = toDate(data.truncatedTo);

        return data;
    }

    /**
     * Gets the time ranges during which specific trains were continuously active in each API.
     * @param opts Options
     */
    async getTrainsAvailability<const Options extends TrainsAvailabilityOptions = {}>(
        opts?: Options
    ): Promise<TrainsAvailabilityResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts) {
            appendAll(queryParams, 'trn', opts.trns);
            appendAll(queryParams, 'api', opts.apis);
            if (opts.time) queryParams.append('time', serialiseTimeFilter(opts.time));
            if (opts.limit) queryParams.append('limit', opts.limit.toString());
            if (opts.limitPerTrn) queryParams.append('limitPerTrn', opts.limitPerTrn.toString());
        }

        const data = await this.get('/history/trains/availability', queryParams);

        for (const train of Object.values(data.trains) as any[]) {
            for (const ranges of Object.values(train) as any[]) {
                for (const range of ranges) {
                    range.start = toDate(range.start);
                    if (range.end !== undefined) range.end = toDate(range.end);
                }
            }
        }
        data.truncatedTo = toDate(data.truncatedTo);

        return data;
    }

    /**
     * Gets all the data from the heartbeat at a time, or null if there is no heartbeat matching the time.
     * @param time The time to get the snapshot of
     * @param opts Options
     */
    async getSnapshot<const Options extends SnapshotOptions = {}>(
        time: Date,
        opts?: Options
    ): Promise<SnapshotResponse<Options> | null> {
        const queryParams = new URLSearchParams({ time: time.getTime().toString() });
        if (opts) {
            appendTrainStatusFilters(queryParams, opts);
            if (opts.matchStrategy) queryParams.append('matchStrategy', opts.matchStrategy);
        }

        let data: any;
        try {
            data = await this.get('/history/snapshot', queryParams);
        } catch (e) {
            if (e instanceof MetroApiError && e.status === 404) return null;
            throw e;
        }

        deserialiseHeartbeat(data.heartbeat);
        for (const train of Object.values(data.timesApiTrains)) deserialiseTimesApiData(train);
        for (const train of Object.values(data.geoApiTrains)) deserialiseGeoApiData(train);
        for (const heartbeat of Object.values(data.statusLastChanged)) deserialiseHeartbeat(heartbeat);

        return data;
    }

    /**
     * Gets any errors (and optionally warnings) that have occurred during a heartbeat.
     * @param opts Options
     */
    async getHeartbeatErrors<const Options extends HeartbeatErrorsOptions = {}>(
        opts?: Options
    ): Promise<HeartbeatErrorsResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts) {
            if (opts.warnings) {
                queryParams.append('warnings', '');
            }
            if (opts.time) {
                queryParams.append('time', serialiseTimeFilter(opts.time));
            }
            appendAll(queryParams, 'api', opts.apis);
        }

        const data = await this.get('/history/heartbeat-errors', queryParams);

        for (const entry of Array.isArray(data) ? data : [...data.errors, ...data.warnings]) {
            deserialiseHeartbeat(entry.heartbeat);
        }

        return data;
    }

    /**
     * Gets the next trains due at all platforms
     * @param opts Options
     */
    async getDueTimes<Options extends DueTimesOptions>(opts?: Options): Promise<DueTimesResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
            queryParams.append('props', serialiseProps(opts.props));
        }

        const data = await this.get('/due-times', queryParams);

        if (data.lastHeartbeat) deserialiseHeartbeat(data.lastHeartbeat);
        for (const dueTimes of Object.values(data.dueTimes ?? {}) as any[][]) {
            deserialiseDueTimes(dueTimes);
        }

        return data;
    }

    /**
     * Gets the next trains due at a platform
     * @param platformCode Platform code
     * @param opts Options
     */
    async getPlatformDueTimes<Options extends PlatformDueTimesOptions>(platformCode: PlatformCode, opts?: Options): Promise<PlatformDueTimesResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
            queryParams.append('props', serialiseProps(opts.props));
        }

        const data = await this.get(`/due-times/platform/${encodeURIComponent(platformCode)}`, queryParams);

        if (data.lastHeartbeat) deserialiseHeartbeat(data.lastHeartbeat);
        if (data.dueTimes) deserialiseDueTimes(data.dueTimes);

        return data;
    }

    /**
     * Gets the next trains due at a station
     * @param stationCode Station code
     * @param opts Options
     */
    async getStationDueTimes<Options extends StationDueTimesOptions>(stationCode: string, opts?: Options): Promise<StationDueTimesResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
            queryParams.append('props', serialiseProps(opts.props));
        }

        const data = await this.get(`/due-times/station/${encodeURIComponent(stationCode)}`, queryParams);

        if (data.lastHeartbeat) deserialiseHeartbeat(data.lastHeartbeat);
        if (data.dueTimes) deserialiseDueTimes(data.dueTimes);

        return data;
    }

    /**
     * Gets the timetable for a day. This is maintained by the host of the proxy, and is not guaranteed to be up to date.
     * @param opts Options
     */
    async getTimetable<const Options extends TimetableOptions = {}>(opts?: Options): Promise<DayTimetable<Options>> {
        const queryParams = new URLSearchParams();
        if (opts) {
            if (opts.date) {
                const d = opts.date;
                queryParams.append('date', `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`);
            }
            if (opts.time && (opts.time.from || opts.time.to)) {
                queryParams.append('time', `${opts.time.from || ''}...${opts.time.to || ''}`);
            }
            if (opts.limit) {
                queryParams.append('limit', opts.limit.toString());
            }
            appendAll(queryParams, 'trn', opts.trns);
            appendAll(queryParams, 'type', opts.types);
            appendAll(queryParams, 'location', opts.locations);
            appendAll(queryParams, 'destination', opts.destinations);
            if (opts.inService !== undefined) {
                queryParams.append('inService', opts.inService ? '1' : '0');
            }
            if (opts.onlyTermini) {
                queryParams.append('onlyTermini', '1');
            }
        }

        const data = await this.get('/timetable', queryParams);

        data.bitmask = BigInt('0x' + data.bitmask);

        return data;
    }

    /**
     * Leases a token with some subscriptions.
     * Use `streamSubscriptions` to receive messages for the token's subscriptions.
     * @param subscriptions Subscriptions to add, of which there must be at least one
     */
    async createSubscriptionToken(subscriptions: SubscriptionRequest[]): Promise<CreateTokenResponse> {
        return this.request('POST', '/subscriptions', undefined, { subscriptions });
    }

    /**
     * Gets information about a token, such as its current `subscriptions`, how many `streams` are connected (0 or 1),
     *  and when it `expiresAt` (or `null` while a stream is connected).
     * Throws a `MetroApiError` with status 404 if the token no longer exists, in which case a new one should be created.
     * @param token Subscription token
     */
    async getSubscriptions(token: string): Promise<SubscriptionTokenDetails> {
        const data = await this.get(`/subscriptions/${encodeURIComponent(token)}`);

        data.expiresAt = toDate(data.expiresAt);

        return data;
    }

    /**
     * Adds subscriptions to a subscription token.
     * New subscriptions replace any existing subscriptions with the same ID, or which they cover.
     * Either all of the subscriptions are added, or none are if any are invalid, redundant, or would exceed the limits.
     * @param token Subscription token
     * @param subscriptions Subscriptions to add, of which there must be at least one
     */
    async subscribe(token: string, subscriptions: SubscriptionRequest[]): Promise<SubscriptionsChange> {
        return this.request('POST', `/subscriptions/${encodeURIComponent(token)}`, undefined, { subscriptions });
    }

    /**
     * Removes a single subscription from a subscription token.
     * @param token Subscription token
     * @param id ID of the subscription
     */
    async unsubscribe(token: string, id: string): Promise<void> {
        await this.request('DELETE', `/subscriptions/${encodeURIComponent(token)}/${encodeURIComponent(id)}`);
    }

    /**
     * Deletes a subscription token, along with its subscriptions. Any connected streams are closed.
     * @param token Subscription token
     */
    async deleteSubscriptionToken(token: string): Promise<void> {
        await this.request('DELETE', `/subscriptions/${encodeURIComponent(token)}`);
    }

    /**
     * Streams messages for a subscription token's subscriptions.
     * Each token can only have `MAX_STREAMS_PER_TOKEN` streams connected (see `getConstants`), so connecting more
     *  closes the oldest.
     * If the proxy closes the stream (`onStreamClosed`), it won't be reconnected.
     * @param token Subscription token
     * @param callbacks Callbacks for each topic's messages
     * @param opts Options
     */
    streamSubscriptions<WithSubscriptionIds extends boolean = false>(
            token: string,
            callbacks: SubscriptionStreamCallbacks<WithSubscriptionIds>,
            opts?: SubscriptionStreamOptions<WithSubscriptionIds>
    ): {
        close(): void;
        connect(): void;
    } {
        const queryParams = new URLSearchParams();
        if (opts?.subscriptionIds) {
            queryParams.append('subscriptionIds', '');
        }

        const eventSource = createEventSource({
            url: `${this.baseUrl}/subscriptions/${encodeURIComponent(token)}/stream?${queryParams}`,
            onConnect: callbacks.onConnect,
            onDisconnect: callbacks.onDisconnect,
            onScheduleReconnect: callbacks.onScheduleReconnect,
            onMessage: (event) => {
                function handle<Message>(
                    callback: ((message: Message) => void) | undefined,
                    deserialise?: (message: any) => void
                ) {
                    if (!callback) return;
                    const message = JSON.parse(event.data);
                    deserialiseHeartbeat(message.heartbeat);
                    deserialise?.(message);
                    callback(message);
                }

                switch (event.event) {
                    case 'station-due-times':
                        handle(callbacks.onStationDueTimes, message => deserialiseDueTimes(message.dueTimes));
                        break;
                    case 'platform-due-times':
                        handle(callbacks.onPlatformDueTimes, message => deserialiseDueTimes(message.dueTimes));
                        break;
                    case 'train':
                        handle(callbacks.onTrain, message => deserialiseCollatedTrain(message.status));
                        break;
                    case 'heartbeat-error':
                        handle(callbacks.onHeartbeatError);
                        break;
                    case 'heartbeat-warning':
                        handle(callbacks.onHeartbeatWarning);
                        break;
                    case 'heartbeat-end':
                        handle(callbacks.onHeartbeatEnd);
                        break;
                    case 'stream-closed':
                        eventSource.close();
                        handle(callbacks.onStreamClosed);
                        break;
                    default:
                        console.warn(`Unknown event type: ${event.event}`);
                        break;
                }
            }
        });
        return eventSource;
    }
}
