import {
    ApiConstants,
    DueTimesOptions,
    DueTimesResponse,
    FullTrainsResponse,
    HeartbeatErrorPayload,
    HeartbeatErrorsOptions,
    HeartbeatErrorsResponse,
    HeartbeatErrorsResponseWithoutWarnings, HeartbeatErrorsStreamOptions,
    HeartbeatWarningsPayload,
    HistoryStreamOptions,
    HistorySummaryResponse, NewTrainHistoryPayload,
    NewTrainsHistoryPayload,
    PlatformCode,
    PlatformDueTimesOptions, PlatformDueTimesPayload,
    PlatformDueTimesResponse, PlatformDueTimesStreamOptions,
    PropsFilter,
    StationDueTimesOptions, StationDueTimesPayload,
    StationDueTimesResponse, StationDueTimesStreamOptions,
    StreamCallbacks,
    TimeFilter,
    TimetableOptions,
    DayTimetable,
    TrainHistoryOptions,
    TrainHistoryResponse, TrainHistoryStreamOptions,
    TrainOptions,
    TrainResponse, TrainsHistoryStreamOptions,
    TrainsOptions,
    TrainsResponse
} from "./types";
import {createEventSource} from 'eventsource-client'

function serializeProps(props: PropsFilter) {
    return props.join(',');
}

function serializeTimeFilter(timeFilter: TimeFilter) {
    if ('at' in timeFilter) return timeFilter.at.getTime().toString();
    let from = '';
    let to = '';
    if ('from' in timeFilter) from = timeFilter.from.getTime().toString();
    if ('to' in timeFilter) to = timeFilter.to.getTime().toString();
    return `${from}...${to}`;
}

function deserializeCollatedTrain(train: any) {
    if (!train.timesAPI) return train;
    const copy = structuredClone(train);
    if (copy.timesAPI.lastEvent?.time !== undefined) {
        copy.timesAPI.lastEvent.time = new Date(copy.timesAPI.lastEvent.time);
    }
    if (copy.timesAPI.plannedDestinations) {
        for (const plannedDestination of copy.timesAPI.plannedDestinations) {
            if (plannedDestination.from?.time !== undefined) {
                plannedDestination.from.time = new Date(plannedDestination.from.time);
            }
        }
    }
    if (copy.timesAPI.nextPlatforms) {
        for (const nextPlatform of copy.timesAPI.nextPlatforms) {
            if (nextPlatform.time) {
                if (nextPlatform.time.actualScheduledTime !== undefined && nextPlatform.time.actualScheduledTime !== null) {
                    nextPlatform.time.actualScheduledTime = new Date(nextPlatform.time.actualScheduledTime);
                }
                if (nextPlatform.time.plannedScheduledTime !== undefined) {
                    nextPlatform.time.actualPredictedTime = new Date(nextPlatform.time.actualPredictedTime);
                }
            }
        }
    }
    return copy;
}

function deserializeHistoryEntry(historyEntry: any) {
    const copy = structuredClone(historyEntry);
    if (copy.date !== undefined) copy.date = new Date(copy.date);
    if (copy.status) copy.status =  deserializeCollatedTrain(copy.status);
    return copy;
}

function deserializeTrainHistorySummary(historySummary: any) {
    const copy = structuredClone(historySummary);
    copy.firstEntry = new Date(copy.firstEntry);
    copy.lastEntry = new Date(copy.lastEntry);
    return copy;
}

function deserializeDueTimes(dueTimes: any) {
    const copy = structuredClone(dueTimes);
    for (const dueTime of copy) {
        if (dueTime.time) {
            if (dueTime.time.actualScheduledTime !== undefined && dueTime.time.actualScheduledTime !== null) {
                dueTime.time.actualScheduledTime = new Date(dueTime.time.actualScheduledTime);
            }
            if (dueTime.time.actualPredictedTime !== undefined) {
                dueTime.time.actualPredictedTime = new Date(dueTime.time.actualPredictedTime);
            }
        }
        if (dueTime.status) dueTime.status = deserializeCollatedTrain(dueTime.status);
    }
    return copy;
}

/**
 * A client for the unofficial Tyne and Wear Metro API proxy
 */
export class MetroApiClient {
    constructor(private readonly baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    /**
     * Gets various constants used by the proxy (new day hour, refresh intervals, history length, stations...)
     */
    async getConstants(): Promise<ApiConstants> {
        const response = await fetch(`${this.baseUrl}/constants`);
        return response.json();
    }

    /**
     * Gets the current status of all currently active trains
     * @param opts Options
     */
    async getTrains<Options extends TrainsOptions>(opts?: Options): Promise<TrainsResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
          queryParams.append('props', serializeProps(opts.props));
        }
        const response = await fetch(`${this.baseUrl}/trains?${queryParams}`);

        // It's not necessarily Full, but it's easier to assume it is
        const data = await response.json() as FullTrainsResponse;

        if (data.lastChecked) data.lastChecked = new Date(data.lastChecked);
        if (data.trains && !Array.isArray(data.trains)) {
            for (const train of Object.values(data.trains)) {
                if (train.status) train.status = deserializeCollatedTrain(train.status);
                if (train.lastChanged !== undefined) train.lastChanged = new Date(train.lastChanged);
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
          queryParams.append('props', serializeProps(opts.props));
        }
        const response = await fetch(`${this.baseUrl}/train/${trn}?${queryParams}`);
        const data = await response.json();
        if (data.lastChecked) data.lastChecked = new Date(data.lastChecked);
        if (data.lastChanged) data.lastChanged = new Date(data.lastChanged);
        if (data.status) data.status = deserializeCollatedTrain(data.status);
        return data;
    }

    /**
     * Gets a summary of the history of all trains with recent history
     */
    async getHistorySummary(): Promise<HistorySummaryResponse> {
        const response = await fetch(`${this.baseUrl}/history`);
        const data = await response.json() as HistorySummaryResponse;
        data.lastChecked = new Date(data.lastChecked);
        for (const trn of Object.keys(data.trains)) {
            data.trains[trn] = deserializeTrainHistorySummary(data.trains[trn]);
        }
        return data;
    }

    /**
     * Gets the history of a train
     * @param trn TRN of the train
     * @param opts Options
     */
    async getTrainHistory<Options extends TrainHistoryOptions>(trn: string, opts?: Options): Promise<TrainHistoryResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts) {
            if (opts.time) {
                queryParams.append('time', serializeTimeFilter(opts.time));
            }
            if (opts.limit) {
                queryParams.append('limit', opts.limit.toString());
            }
            if (opts.active !== undefined) {
                queryParams.append('active', opts.active ? '1' : '0');
            }
            if (opts.props) {
                queryParams.append('props', serializeProps(opts.props));
            }
        }
        const response = await fetch(`${this.baseUrl}/history/train/${trn}?${queryParams}`);

        const data = await response.json();
        if (data.lastChecked) data.lastChecked = new Date(data.lastChecked);
        if (data.summary) data.summary = deserializeTrainHistorySummary(data.summary);
        if (data.extract) data.extract = data.extract.map(deserializeHistoryEntry);
        return data;
    }

    /**
     * Gets any errors (and optionally warnings) that have occurred during a heartbeat.
     * @param opts Options
     */
    async getHeartbeatErrors<Options extends HeartbeatErrorsOptions>(opts?: Options): Promise<HeartbeatErrorsResponse<Options>> {
        const queryParams = new URLSearchParams();
        if (opts) {
            if (opts.warnings) {
                queryParams.append('warnings', '');
            }
            if (opts.time) {
                queryParams.append('time', serializeTimeFilter(opts.time));
            }
            if (opts.apis) {
                queryParams.append('apis', opts.apis.join(','));
            }
        }
        const response = await fetch(`${this.baseUrl}/history/heartbeat-errors?${queryParams}`);
        const data = await response.json();
        if ('warnings' in data) {
            for (const error of data.errors) {
                error.date = new Date(error.date);
            }
            for (const warning of data.warnings) {
                warning.date = new Date(warning.date);
            }
        } else {
            for (const error of data as HeartbeatErrorsResponseWithoutWarnings) {
                error.date = new Date(error.date);
            }
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
            queryParams.append('props', serializeProps(opts.props));
        }
        const response = await fetch(`${this.baseUrl}/due-times?${queryParams}`);
        const data = await response.json();
        if (data.lastChecked) data.lastChecked = new Date(data.lastChecked);
        if (data.dueTimes) data.dueTimes = deserializeDueTimes(data.dueTimes);
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
            queryParams.append('props', serializeProps(opts.props));
        }
        const response = await fetch(`${this.baseUrl}/due-times/platform/${platformCode}?${queryParams}`);
        const data = await response.json();
        if (data.lastChecked) data.lastChecked = new Date(data.lastChecked);
        if (data.dueTimes) data.dueTimes = deserializeDueTimes(data.dueTimes);
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
            queryParams.append('props', serializeProps(opts.props));
        }
        const response = await fetch(`${this.baseUrl}/due-times/station/${stationCode}?${queryParams}`);
        const data = await response.json();
        if (data.lastChecked) data.lastChecked = new Date(data.lastChecked);
        if (data.dueTimes) data.dueTimes = deserializeDueTimes(data.dueTimes);
        return data;
    }

    /**
     * Gets the timetable for a day. This is maintained by the host of the proxy, and is not guaranteed to be up to date.
     * @param opts Options
     */
    async getTimetable(opts?: TimetableOptions): Promise<DayTimetable> {
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
            for (const opt of ['trns', 'types', 'locations', 'destinations'] as const) {
                if (opts[opt]) {
                    queryParams.append(opt, opts[opt].join(','));
                }
            }
            if (opts.inService !== undefined) {
                queryParams.append('inService', opts.inService ? '1' : '0');
            }
            if (opts.onlyTermini) {
                queryParams.append('onlyTermini', '1');
            }
        }
        const response = await fetch(`${this.baseUrl}/timetable?${queryParams}`);
        const data = await response.json();
        data.bitmask = BigInt('0x' + data.bitmask);
        return data;
    }

    /**
     * Streams all new train history, heartbeat errors and warnings.
     * @param callbacks Callbacks for the events
     * @param opts Options
     */
    streamHistory<Options extends HistoryStreamOptions>(
            callbacks: StreamCallbacks & {
                onNewTrainHistoryEntries: (data: NewTrainsHistoryPayload) => void,
                onHeartbeatError: (data: HeartbeatErrorPayload) => void,
                onHeartbeatWarnings: (data: HeartbeatWarningsPayload) => void,
            },
            opts?: Options
    ): {
        close(): void;
        connect(): void;
    } {
        const queryParams = new URLSearchParams();
        if (opts?.trainProps) {
            queryParams.append('trainProps', serializeProps(opts.trainProps));
        }
        return createEventSource({
            url: `${this.baseUrl}/history/stream?${queryParams}`,
            ...callbacks,
            onMessage: (event) => {
                const data = JSON.parse(event.data);
                if (data.date !== undefined) data.date = new Date(data.date);
                switch (event.event) {
                    case 'new-trains-history':
                        if (data.trains && !Array.isArray(data.trains)) {
                            for (const train of Object.values(data.trains) as any[]) {
                                if (train.status) train.status = deserializeCollatedTrain(train.status);
                            }
                        }
                        callbacks.onNewTrainHistoryEntries(data);
                        break;
                    case 'heartbeat-error':
                        callbacks.onHeartbeatError(data);
                        break;
                    case 'heartbeat-warnings':
                        callbacks.onHeartbeatWarnings(data);
                        break;
                    default:
                        console.warn(`Unknown event type: ${event.event}`);
                        break;
                }
            }
        });
    }


    /**
     * Streams real-time updates for a single train.
     * @param trn TRN of the train
     * @param callbacks Callbacks for the events
     * @param opts Options
     */
    streamNewTrainHistory(
            trn: string,
            callbacks: StreamCallbacks & {
                onNewHistoryEntry: (data: NewTrainHistoryPayload) => void,
            },
            opts?: TrainHistoryStreamOptions
    ): {
        close(): void;
        connect(): void;
    } {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
            queryParams.append('props', serializeProps(opts.props));
        }
        return createEventSource({
            url: `${this.baseUrl}/history/train/${trn}/stream?${queryParams}`,
            ...callbacks,
            onMessage: (event) => {
                if (event.event !== 'new-train-history') {
                    console.warn(`Unknown event type: ${event.event}`);
                    return;
                }
                const data = JSON.parse(event.data);
                if (data.date !== undefined) data.date = new Date(data.date);
                if (data.status) data.status = deserializeCollatedTrain(data.status);
                callbacks.onNewHistoryEntry(data);
            }
        });
    }

    /**
     * Streams real-time train history updates.
     * @param callbacks Callbacks for the events
     * @param opts Options
     */
    streamTrainsHistory(
            callbacks: StreamCallbacks & {
                onNewHistoryEntries: (data: NewTrainsHistoryPayload) => void,
            },
            opts?: TrainsHistoryStreamOptions
    ): {
        close(): void;
        connect(): void;
    } {
        const queryParams = new URLSearchParams();
        if (opts?.trainProps) {
            queryParams.append('trainProps', serializeProps(opts.trainProps));
        }
        return createEventSource({
            url: `${this.baseUrl}/history/trains/stream?${queryParams}`,
            ...callbacks,
            onMessage: (event) => {
                if (event.event !== 'new-trains-history') {
                    console.warn(`Unknown event type: ${event.event}`);
                    return;
                }
                const data = JSON.parse(event.data);
                if (data.date !== undefined) data.date = new Date(data.date);
                if (data.trains && !Array.isArray(data.trains)) {
                    for (const train of Object.values(data.trains) as any[]) {
                        if (train.status) {
                            train.status = deserializeCollatedTrain(train.status);
                        }
                    }
                }
                callbacks.onNewHistoryEntries(data);
            }
        });
    }

    /**
     * Streams heartbeat errors (and optionally warnings).
     * @param callbacks Callbacks for the events
     * @param opts Options
     */
    streamHeartbeatErrors(
            callbacks: StreamCallbacks & {
                onHeartbeatError: (data: HeartbeatErrorPayload) => void,
                onHeartbeatWarnings?: (data: HeartbeatWarningsPayload) => void,
            },
            opts?: HeartbeatErrorsStreamOptions
    ): {
        close(): void;
        connect(): void;
    } {
        const queryParams = new URLSearchParams();
        if (callbacks.onHeartbeatWarnings) {
            queryParams.append('warnings', '');
        }
        if (opts?.apis) {
            queryParams.append('apis', opts.apis.join(','));
        }
        return createEventSource({
            url: `${this.baseUrl}/history/heartbeat-errors/stream?${queryParams}`,
            ...callbacks,
            onMessage: (event) => {
                const data = JSON.parse(event.data);
                if (data.date !== undefined) data.date = new Date(data.date);
                switch (event.event) {
                    case 'heartbeat-error':
                        callbacks.onHeartbeatError(data);
                        break;
                    case 'heartbeat-warnings':
                        if (callbacks.onHeartbeatWarnings) {
                            callbacks.onHeartbeatWarnings(data);
                        } else {
                            console.warn("Received heartbeat-warnings event, but it wasn't subscribed to.");
                        }
                        break;
                    default:
                        console.warn(`Unexpected event type: ${event.event}`);
                        break;
                }
            }
        });
    }

    /**
     * Streams real-time due times for a station.
     * @param stationCode Station code
     * @param callbacks Callbacks for the events
     * @param opts Options
     */
    streamStationDueTimes<Options extends StationDueTimesStreamOptions>(
            stationCode: string,
            callbacks: StreamCallbacks & {
                onDueTimes: (data: StationDueTimesPayload<Options>) => void,
            },
            opts?: Options
    ): {
        close(): void;
        connect(): void;
    } {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
            queryParams.append('props', serializeProps(opts.props));
        }
        return createEventSource({
            url: `${this.baseUrl}/due-times/station/${stationCode}/stream?${queryParams}`,
            ...callbacks,
            onMessage: (event) => {
                const data = JSON.parse(event.data);
                if (data.date !== undefined) data.date = new Date(data.date);
                if (data.dueTimes) data.dueTimes = deserializeDueTimes(data.dueTimes);
                callbacks.onDueTimes(data);
            }
        });
    }


    /**
     * Streams real-time due times for a platform.
     * @param platformCode Platform code
     * @param callbacks Callbacks for the events
     * @param opts Options
     */
    streamPlatformDueTimes<Options extends PlatformDueTimesStreamOptions>(
            platformCode: string,
            callbacks: StreamCallbacks & {
                onDueTimes: (data: PlatformDueTimesPayload<Options>) => void,
            },
            opts?: Options
    ): {
        close(): void;
        connect(): void;
    } {
        const queryParams = new URLSearchParams();
        if (opts?.props) {
            queryParams.append('props', serializeProps(opts.props));
        }
        return createEventSource({
            url: `${this.baseUrl}/due-times/platform/${platformCode}/stream?${queryParams}`,
            ...callbacks,
            onMessage: (event) => {
                const data = JSON.parse(event.data);
                if (data.date !== undefined) data.date = new Date(data.date);
                if (data.dueTimes) data.dueTimes = deserializeDueTimes(data.dueTimes);
                callbacks.onDueTimes(data);
            }
        });
    }
}
