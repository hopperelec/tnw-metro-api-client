// --- Utility Types ---

// Flattens intersection types, so editors show a single object
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * The values given for an array option, or `Default` if it wasn't given.
 * An empty array also gives `Default`, since empty filters match everything.
 * Specific values are only known if the array was written inline, rather than being a variable of a general type.
 */
type ArrayOptionValues<Options, Key extends PropertyKey, Default> =
    Key extends keyof Options
        ? Options[Key] extends readonly (infer Value extends Default)[]
            ? [Value] extends [never] ? Default : Value
            : Default
        : Default;

/** Whether `Value` is definitely one of the elements of the tuple `Values` */
type DefinitelyIncludes<Values extends readonly unknown[], Value> =
    Values extends readonly [infer First, ...infer Rest]
        ? [First] extends [Value] ? true : DefinitelyIncludes<Rest, Value>
        : false;

/**
 * Whether a value is definitely, possibly or not included by an array option,
 *  where an empty or missing array includes everything.
 */
type ArrayOptionIncludes<Options, Key extends PropertyKey, Value> =
    Key extends keyof Options
        // If the option is optional, it's unknown whether it was given
        ? {} extends Pick<Options, Key>
            ? "possibly"
            : Options[Key] extends infer Values extends readonly unknown[]
                ? Values extends readonly []
                    ? "included"
                    : DefinitelyIncludes<Values, Value> extends true
                        ? "included"
                        : Value extends Values[number] ? "possibly" : "excluded"
                : "included"
        : "included";

/** `Properties` if they are definitely included, partial if they are possibly included, or nothing otherwise */
type IncludedProperties<Inclusion, Properties> =
    Inclusion extends "included" ? Properties
    : Inclusion extends "possibly" ? Partial<Properties>
    : {};

/**
 * A record of the keys which were filtered for.
 * If specific keys were filtered for, they are each optional, since there may not be any data for them.
 */
type FilteredRecord<Key extends string, Value> =
    string extends Key ? Record<Key, Value> : Prettify<Partial<Record<Key, Value>>>;

// --- Filtering ---

/**
 * A list of properties, which are themselves dot-separated lists of keys.
 * To only select keys of a record, use the `"keys"` property; for example, `?props=trains.keys`.
 * For arrays or records, keys will be filtered on each element instead.
 * If no properties are specified, all properties will be included.
 */
export type PropsFilter = string[];

/** Interface for responses allowing filtering of properties. */
export interface FilterableProps {
    /** Properties to include in the response. */
    props?: PropsFilter;
}

// See: https://stackoverflow.com/a/51365037/17168710
type RecursivePartial<T> = {
    [P in keyof T]?:
    T[P] extends (infer U)[] ? RecursivePartial<U>[] :
        T[P] extends object | undefined ? RecursivePartial<T[P]> :
            T[P];
};

type FilteredByProps<
    T, Options, PropsKey extends string = "props"
> = PropsKey extends keyof Options ? RecursivePartial<T> : T;

export type TimeFilter =
    | { at: Date; }
    | { from: Date; }
    | { to: Date; }
    | { from: Date; to: Date; };

/** Options for filtering trains by their statuses. Each filter matches any of its values. */
export interface TrainStatusFilters {
    /**
     * Only include trains with these TRNs.
     * If none are specified, all trains are included.
     */
    trns?: readonly Trn[];
    /**
     * Only include statuses where the last event is of one of these types (e.g., `"ARRIVED"`).
     * If none are specified, all event types are included.
     */
    eventTypes?: readonly string[];
    /**
     * Only include statuses where the last event was at one of these locations, in the format
     *  `<station code>_<platform number>` (e.g., `"MTW_4"`), or just a station code for all platforms at a station.
     * If none are specified, all locations are included.
     */
    locations?: readonly TimetabledLocation[];
    /**
     * Only include statuses with one of these destinations (e.g., `"South Hylton"` or `"Not In Service"`).
     * For the Times API, this is the first planned destination.
     * If none are specified, all destinations are included.
     */
    destinations?: readonly string[];
}

// --- Underlying API Related Types ---

/** A train running number (TRN) without the leading "T" (e.g., `"101"`). */
export type Trn = string;

/**
 * An identifier for a location a train can be timetabled to be.
 * This is usually in the format `<station code>_<platform number>` (e.g., `"MTW_4"`).
 * It can also be just a station code, particularly for NIS stations like sidings.
 * While the proxy does control these codes, it is not recommended to assume that they are always in this format,
 *  as they may change in the future.
 */
export type TimetabledLocation = string;

/**
 * A unique identifier for a platform.
 * This is usually in the format `<station code>;<platform number>` (e.g., `"MTW;4"`).
 * However, the proxy does not check if this is in the expected format,
 *  so you should do your own checks if you need to parse this.
 */
export type PlatformCode = string;

/** Valid platform numbers. */
export type PlatformNumber = 1 | 2 | 3 | 4;

/** An API which the proxy can get train data from. */
export type TrainDataApi = "TIMES" | "GEO";

/** An API which the proxy can record errors and warnings for. */
export type ApiType = TrainDataApi | "GATEWAY";

/** When a heartbeat (the proxy polling the APIs) started and ended. */
export interface HeartbeatTimes {
    /** When the heartbeat started. */
    startedAt: Date;
    /** When the heartbeat ended, or null if it is still ongoing or was interrupted. */
    endedAt: Date | null;
}

/** When a train is expected to arrive at a platform. */
export interface DueTime {
    /** In how many minutes the train is due. `0` for "Due", `-1` for "Arrived", `-2` for "Delayed". */
    dueIn: number;
    /** The scheduled time, according to Nexus, or null. */
    actualScheduledTime: Date | null;
    /** The predicted time, according to Nexus. */
    actualPredictedTime: Date;
}

/** A platform at a station. */
export interface ParsedPlatform {
    /** The name of the station (e.g., `"Monument"`). */
    station: string;
    /** The platform number. */
    platformNumber: number;
}

/** Information about a train derived from the Times API. */
export interface TimesApiData {
    /** The last event for the train. */
    lastEvent: {
        /** The type of the last event (e.g., `"APPROACHING"`, `"ARRIVED"`). */
        type: string;
        /**
         * Where the last event occurred.
         * This is only a string if it isn't in the expected format,
         *  in which case it is exactly as provided by the upstream API.
         */
        location: ParsedPlatform | string;
        /** The time of the last event. */
        time: Date;
    };
    /** List of planned destinations for the train, in order of when they are expected to become the current destination. */
    plannedDestinations: {
        /** The name of the destination station. */
        name: string;
        /** When and where this is expected to become the current destination. */
        from: {
            /** Where this is expected to become the current destination. */
            platformCode: PlatformCode;
            /** When this is expected to become the current destination. */
            time: Date;
        }
    }[];
    /** List of next platforms for the train, in order of planned arrival. */
    nextPlatforms: {
        /** The code of the platform. */
        code: PlatformCode
        /** When the train is expected to arrive at this platform. */
        time: DueTime;
    }[];
}

/** A type of event in a last seen message from the Geo API. */
export type GeoApiEventType = "APPROACHING" | "ARRIVED" | "READY_TO_START" | "DEPARTED";

export interface ParsedGeoApiLastSeen extends ParsedPlatform {
    /** Type of the last seen event. */
    type: GeoApiEventType;
    /** When the last seen event occurred. */
    time: Date;
}

/** Information about a train derived from the Geo API. */
export interface GeoApiData {
    /** The name of the train's current destination. */
    destination: string;
    /**
     * When and where the train was last seen.
     * This is only a string if it isn't in the expected format,
     *  in which case it is exactly as provided by the upstream API.
     */
    lastSeen: ParsedGeoApiLastSeen | string;
}

/** Collated train data from one or both APIs. */
export type CollatedTrain =
    | { timesAPI: TimesApiData; geoAPI?: GeoApiData }
    | { timesAPI?: TimesApiData; geoAPI: GeoApiData };

/** Times API data as stored in the history, which omits `nextPlatforms`. */
export type HistoricTimesApiData = Omit<TimesApiData, "nextPlatforms">;

// --- Heartbeat Errors and Warnings ---

/** An error that occurred during a heartbeat. */
export interface HeartbeatError<Api extends ApiType = ApiType> {
    /** Identifier of the API that produced the error. */
    api: Api;
    /** The error message. */
    message: string;
    /** The heartbeat during which the error occurred. */
    heartbeat: HeartbeatTimes;
}

/** A warning generated during a heartbeat. */
export interface HeartbeatWarning<Api extends ApiType = ApiType> {
    /** Identifier of the API that produced the warning(s). */
    api: Api;
    /** The structure of this object depends on the API that produced the warning. */
    data: any;
    /** The heartbeat during which the warning was generated. */
    heartbeat: HeartbeatTimes;
}

// --- `/constants` Endpoint ---

/** Response from the `/constants` endpoint. */
export interface ApiConstants<
    LocationAbbreviations extends Record<string, string> = Record<string, string>,
    Lines extends Record<string, (keyof LocationAbbreviations)[]> = Record<string, (keyof LocationAbbreviations)[]>,
> {
    /** The hour at which the timetable resets to the next day (0-23). */
    NEW_DAY_HOUR: number;

    /** The interval, in milliseconds, at which heartbeats always happen. */
    PASSIVE_REFRESH_INTERVAL: number;
    /** The minimum time, in milliseconds, between heartbeats, such as when a request is made for a train's current status. */
    ACTIVE_REFRESH_MINIMUM_TIMEOUT: number;

    /** The maximum number of history entries (limit) returned by train history endpoints. */
    MAX_HISTORY_REQUEST_LIMIT: number;
    /** The default number of history entries (limit) returned by train history endpoints if no limit is specified. */
    DEFAULT_HISTORY_REQUEST_LIMIT: number;

    /** The maximum number of subscription tokens which can exist at a time for each IP address. */
    MAX_SUBSCRIPTION_TOKENS_PER_IP: number;
    /** The maximum number of subscriptions each subscription token can have. */
    MAX_SUBSCRIPTIONS_PER_TOKEN: number;
    /** The maximum number of streams which can be connected for each subscription token. Connecting more closes the oldest. */
    MAX_STREAMS_PER_TOKEN: number;
    /** The maximum total number of values in the filters of each subscription (e.g., TRNs and destinations). */
    MAX_SUBSCRIPTION_FILTER_VALUES: number;

    /** A list of location abbreviations that refer to valid passenger stops (ie, not depots, sidings, vents, etc.) */
    PASSENGER_STOPS: (keyof LocationAbbreviations)[];
    /** A map of lines and the stations on them */
    LINES: Lines;
    /** A map from location abbreviations to human-readable names */
    LOCATION_ABBREVIATIONS: LocationAbbreviations;
    /** A map from route codes to destinations */
    ROUTE_CODES: Record<number, TimetabledLocation>;
}

// --- `/trains` Endpoint ---

/** Options for the `/trains` endpoint */
export interface TrainsOptions extends FilterableProps {}

/** Response from the `/trains` endpoint, assuming all properties are present. */
export interface FullTrainsResponse {
    /** The last heartbeat. */
    lastHeartbeat: HeartbeatTimes;
    /** Map of TRNs to all active trains. */
    trains: Record<Trn, {
        /** The train's current status. */
        status: CollatedTrain;
        /** The heartbeat during which this train's status last changed. */
        statusLastChanged: HeartbeatTimes;
    }>;
}

/** Response from the `/trains` endpoint. */
export type TrainsResponse<Options extends TrainsOptions> = FilteredByProps<FullTrainsResponse, Options>;

// --- `/train/:trn` Endpoint ---

/** Options for the `/train/:trn` endpoint. */
export interface TrainOptions extends FilterableProps {}

/** Expected timetabled location for a train. */
export interface ExpectedTrainState {
    /** Event, relative to the expected location. */
    event: 'ARRIVED' | 'DEPARTED' | 'APPROACHING' | 'TERMINATED';
    /** The location the train is expected to be. */
    location: TimetabledLocation;
    /** Whether the train is expected to be in passenger service. */
    inService: boolean;
    /** The location the train is expected to be heading to. */
    destination: string;
}

/** Response from the `/train/:trn` endpoint, assuming all properties are present. */
export interface FullTrainResponse {
    /** The last heartbeat. */
    lastHeartbeat: HeartbeatTimes;
    /** The heartbeat during which this train's status last changed, or null if no historic data is available for this train. */
    statusLastChangedDuring: HeartbeatTimes | null;
    /** The expected state of the train, or null if the train is not timetabled for today. */
    timetable: ExpectedTrainState | null;
    /** The train's current status, if the train is currently active. */
    status?: CollatedTrain;
}

/** Response from the `/train/:trn` endpoint. */
export type TrainResponse<Options extends TrainOptions> = FilteredByProps<FullTrainResponse, Options>;

// --- `/due-times` Endpoint ---

/** Options for the `/due-times` endpoint. */
export interface DueTimesOptions extends FilterableProps {}

/** Response from the `/due-times` endpoint, assuming all properties are present. */
export interface FullDueTimesResponse {
    /** The last heartbeat. */
    lastHeartbeat: HeartbeatTimes;
    /**
     * Map of platform codes to a list of the next trains due at that platform, in order of `time.dueIn`.
     *
     * Note that the same train can theoretically appear multiple times if:
     * - it is expected to turn around facing road
     * - it is running a very short shuttle service, which it is expected to lap within 100 minutes
     * - or, most likely, if the API is confused.
     */
    dueTimes: Record<PlatformCode, {
        /** The TRN of the train to arrive at the platform. */
        trn: Trn;
        /** When that train is expected to arrive at the platform. */
        time: DueTime;
    }[]>;
}

/** Response from the `/due-times` endpoint. */
export type DueTimesResponse<Options extends DueTimesOptions> = FilteredByProps<FullDueTimesResponse, Options>;

// --- `/due-times/station/:station` Endpoint ---

/** Options for the `/due-times/station/:station` endpoint. */
export interface StationDueTimesOptions extends FilterableProps {}

/** A train due at a station. */
export interface StationDueTime extends PlatformDueTime {
    /** The platform number. */
    platform: PlatformNumber;
}

/** Response from the `/due-times/station/:station` endpoint, assuming all properties are present. */
export interface FullStationDueTimesResponse {
    /** The last heartbeat. */
    lastHeartbeat: HeartbeatTimes;
    /** The next trains due at this station, in order of `time.dueIn`. */
    dueTimes: StationDueTime[];
}

/** Response from the `/due-times/station/:station` endpoint. */
export type StationDueTimesResponse<Options extends StationDueTimesOptions> = FilteredByProps<FullStationDueTimesResponse, Options>;

// --- `/due-times/platform/:platform` Endpoint ---

/** Options for the `/due-times/platform/:platform` endpoint. */
export interface PlatformDueTimesOptions extends FilterableProps {}

/** A train due at a platform. */
export interface PlatformDueTime {
    /** The TRN of the train to arrive at the platform. */
    trn: Trn;
    /** When that train is expected to arrive at the platform. */
    time: DueTime;
    /** The current status of the train. */
    status: CollatedTrain;
}

/** Response from the `/due-times/platform/:platform` endpoint, assuming all properties are present. */
export interface FullPlatformDueTimesResponse {
    /** The last heartbeat. */
    lastHeartbeat: HeartbeatTimes;
    /** The next trains due at this platform, in order of `time.dueIn`. */
    dueTimes: PlatformDueTime[];
}

/** Response from the `/due-times/platform/:platform` endpoint. */
export type PlatformDueTimesResponse<Options extends PlatformDueTimesOptions> = FilteredByProps<FullPlatformDueTimesResponse, Options>;

// --- History ---

/** Options for limiting history, by truncating the time window until the limit is satisfied. */
export interface HistoryLimitOptions {
    /** Range of time to get the history for */
    time?: TimeFilter;
    /**
     * Limit the total number of entries returned across all trains.
     * Check `/constants` for the default and maximum values.
     * Results are ordered from `time.from` if specified, otherwise backwards from `time.to` (or now).
     */
    limit?: number;
    /** Limit the number of entries returned per train. */
    limitPerTrn?: number;
}

/** A period during which a train's status (in one API) stayed the same. */
export interface TrainHistoryEntry<Status> {
    /** The heartbeat during which this status started. */
    startHeartbeat: HeartbeatTimes;
    /** The heartbeat during which this status ended, or null if it is still current. */
    endHeartbeat: HeartbeatTimes | null;
    /** The train's status during this period. */
    status: Status;
}

// --- `/history/trains` Endpoint ---

/** Options for the `/history/trains` endpoint. */
export interface TrainsHistoryOptions extends TrainStatusFilters, HistoryLimitOptions {
    /** Which APIs to include history from. If none are specified, all APIs are included. */
    apis?: readonly TrainDataApi[];
}

/** A train's history from each API included by the options. */
export type TrainHistory<Options extends TrainsHistoryOptions = {}> = Prettify<
    IncludedProperties<ArrayOptionIncludes<Options, "apis", "TIMES">, {
        /** History from the Times API, if included. */
        timesAPI: TrainHistoryEntry<HistoricTimesApiData>[];
    }> &
    IncludedProperties<ArrayOptionIncludes<Options, "apis", "GEO">, {
        /** History from the Geo API, if included. */
        geoAPI: TrainHistoryEntry<GeoApiData>[];
    }>
>;

/** Response from the `/history/trains` endpoint. */
export interface TrainsHistoryResponse<Options extends TrainsHistoryOptions = {}> {
    /** Map of TRNs to their history from each API, in the order requested (see `HistoryLimitOptions.limit`). */
    trains: FilteredRecord<ArrayOptionValues<Options, "trns", Trn>, TrainHistory<Options>>;
    /** If the results were truncated due to a limit being reached, the time they were truncated to. */
    truncatedTo: Date | null;
}

// --- `/history/trains/availability` Endpoint ---

/** Options for the `/history/trains/availability` endpoint. */
export interface TrainsAvailabilityOptions extends HistoryLimitOptions {
    /** Only include trains with these TRNs. If none are specified, all trains are included. */
    trns?: readonly Trn[];
    /** Which APIs to include availability for. If none are specified, all APIs are included. */
    apis?: readonly TrainDataApi[];
}

/** A period during which a train was continuously active in an API. */
export interface AvailabilityRange {
    /** When the train became active. */
    start: Date;
    /** When the train stopped being active, if it isn't still active. */
    end?: Date;
}

/** Response from the `/history/trains/availability` endpoint. */
export interface TrainsAvailabilityResponse<Options extends TrainsAvailabilityOptions = {}> {
    /** Map of TRNs to the periods during which they were active in each API. */
    trains: FilteredRecord<
        ArrayOptionValues<Options, "trns", Trn>,
        // An API is only included if the train was active in it
        Prettify<Partial<Record<ArrayOptionValues<Options, "apis", TrainDataApi>, AvailabilityRange[]>>>
    >;
    /** If the results were truncated due to a limit being reached, the time they were truncated to. */
    truncatedTo: Date | null;
}

// --- `/history/snapshot` Endpoint ---

/**
 * How to find the heartbeat for a snapshot.
 * - `"before"`: the heartbeat immediately before the time
 * - `"after"`: the heartbeat immediately after the time
 * - `"exact"`: the heartbeat in progress at the time
 * - `"nearest"`: the heartbeat closest to the time
 */
export type SnapshotMatchStrategy = "before" | "after" | "exact" | "nearest";

/** Options for the `/history/snapshot` endpoint. */
export interface SnapshotOptions extends TrainStatusFilters {
    /** How to find the heartbeat for the time. Defaults to `"before"`. */
    matchStrategy?: SnapshotMatchStrategy;
}

/** Response from the `/history/snapshot` endpoint. */
export interface SnapshotResponse<Options extends SnapshotOptions = {}> {
    /** The heartbeat which the snapshot is of. */
    heartbeat: HeartbeatTimes;
    /** Map of TRNs to their data from the Times API during the heartbeat. */
    timesApiTrains: FilteredRecord<ArrayOptionValues<Options, "trns", Trn>, HistoricTimesApiData>;
    /** Map of TRNs to their data from the Geo API during the heartbeat. */
    geoApiTrains: FilteredRecord<ArrayOptionValues<Options, "trns", Trn>, GeoApiData>;
    /** Map of TRNs to the heartbeat during which their status last changed, as of the heartbeat. */
    statusLastChanged: FilteredRecord<ArrayOptionValues<Options, "trns", Trn>, HeartbeatTimes>;
    /** All errors that occurred during the heartbeat. */
    errors: Omit<HeartbeatError, "heartbeat">[];
    /** All warnings generated during the heartbeat. */
    warnings: Omit<HeartbeatWarning, "heartbeat">[];
}

// --- `/history/heartbeat-errors` Endpoint ---

/** Options for `/history/heartbeat-errors` endpoint */
export interface HeartbeatErrorsOptions {
    /** Whether to also receive warnings. */
    warnings?: boolean
    /** Range of time to get the history for. */
    time?: TimeFilter;
    /** Which APIs to get errors (and optionally warnings) for. If none are specified, all APIs are included. */
    apis?: readonly ApiType[];
}

type FilteredByApi<Options extends { apis?: readonly ApiType[] }> = ArrayOptionValues<Options, "apis", ApiType>;

/** Response from the `/history/heartbeat-errors` endpoint when warnings are not included. */
export type HeartbeatErrorsResponseWithoutWarnings<Options extends { apis?: readonly ApiType[] } = {}> =
    HeartbeatError<FilteredByApi<Options>>[];

/** Response from the `/history/heartbeat-errors` endpoint when warnings are also included. */
export type HeartbeatErrorsResponseWithWarnings<Options extends { apis?: readonly ApiType[] } = {}> = {
    errors: HeartbeatError<FilteredByApi<Options>>[];
    warnings: HeartbeatWarning<FilteredByApi<Options>>[];
}

export type HeartbeatErrorsResponse<Options extends HeartbeatErrorsOptions> =
    Options extends { warnings: true }
        ? HeartbeatErrorsResponseWithWarnings<Options>
        : HeartbeatErrorsResponseWithoutWarnings<Options>;

// --- `/timetable` Endpoint ---

/**
 * Type of timetable entry.
 *
 * 1: Depot start
 * 2: Passenger stop
 * 3: ECS or skips
 * 4: Depot end
 */
export type TimetableType = 1 | 2 | 3 | 4;

/** Options for the `/timetable` endpoint */
export interface TimetableOptions {
    /**
     * Date to get the timetable for. Defaults to today.
     * Keep in mind that the timetable will usually cross midnight into the next day.
     */
    date?: Date;
    /** Range of time to filter the timetable by. */
    time?: {
        /** Start of the time range, in seconds since midnight. */
        from?: number;
        /** End of the time range, in seconds since midnight. */
        to?: number;
    };
    /**
     * Maximum number of results to return. Intended to be used in conjunction with `time`.
     * If `time` only specifies a `to`, the limit will be applied in reverse.
     * Defaults to all entries matching the query.
     */
    limit?: number;
    /** Filter which TRNs to get the timetable for. Defaults to all timetabled TRNs. */
    trns?: readonly Trn[];
    /** Filter the entries by type. Defaults to all types. */
    types?: readonly TimetableType[];
    /** Filter the entries by location. Defaults to all locations. */
    locations?: readonly TimetabledLocation[];
    /** Filter the entries by destination. Defaults to all destinations. */
    destinations?: readonly TimetabledLocation[];
    /**
     * Filter the entries by whether the train is in passenger service.
     * Defaults to including both in-service and not in-service trains.
     */
    inService?: boolean;
    /**
     * Whether to only return entries for termini (entries where either `arrivalTime` or `departureTime` is missing).
     * Defaults to false, meaning all entries are returned. `false` and `undefined` are equivalent here.
     */
    onlyTermini?: boolean;
}

/** An entry in a train's timetable. */
export interface TrainTimetableEntry {
    /** Type of this entry */
    type: TimetableType;
    /** Where the train is timetabled to be at this time. */
    location: TimetabledLocation;
    /**
     * When this entry starts (i.e., when the train is expected to arrive at this location).
     * Missing if the train starts at this location, but at least one of this and `departureTime` is always present.
     */
    arrivalTime?: number;
    /**
     * When this entry ends (i.e., when the train is expected to depart from this location).
     * Missing if the train terminates at this location, but at least one of this and `arrivalTime` is always present.
     */
    departureTime?: number;
    /** Whether the train is timetabled to be in passenger service at this time */
    inService: boolean;
    /** Where the train is timetabled to be headed at this time */
    destination: TimetabledLocation;
}

/** An entry in a train's timetable, which matches the types and passenger service filtered for. */
type FilteredTrainTimetableEntry<Options extends TimetableOptions> = Prettify<TrainTimetableEntry & {
    type: ArrayOptionValues<Options, "types", TimetableType>;
    inService: Options extends { readonly inService: infer InService extends boolean } ? InService : boolean;
}>;

/** A list of entries in a train's timetable, ordered by time. */
export type TrainTimetable<Options extends TimetableOptions = {}> = FilteredTrainTimetableEntry<Options>[];

/** Response from the `/timetable` endpoint, the timetable for a single day. */
export interface DayTimetable<Options extends TimetableOptions = {}> {
    /**
     * A unique identifier for the timetable referenced.
     * Usually, this is the name of the zip file provided by Nexus starting with DEP.
     *  However, where the zip file provided had a generic name, this may be chosen by the host of this proxy.
     */
    ref: string;
    /** The service ID for the timetable referenced. */
    serviceId: string;
    /** Description of the base timetable referenced. */
    description: string;
    /**
     * The date this timetable claims to be effective from, usually in DD-Mmm-YYYY format.
     * This is not used to select the timetable since other timetables can take precedence.
     */
    effectiveFrom: string;
    /**
     * The date this timetable claims to be effective to, usually in DD-Mmm-YYYY format.
     * This is not used to select the timetable since other timetables can take precedence.
     */
    effectiveTo: string;
    /**
     * A bitmask representing the dates between effectiveFrom and effectiveTo (inclusive)
     *  that this timetable claims to be effective on.
     * This is not used to select the timetable since other timetables can take precedence.
     */
    bitmask: BigInt;
    /** Map of TRNs to their timetables. */
    trains: FilteredRecord<ArrayOptionValues<Options, "trns", Trn>, TrainTimetable<Options>>;
}

// --- Subscriptions ---

/** A topic which can be subscribed to. */
export type SubscriptionTopic =
    | "station-due-times"
    | "platform-due-times"
    | "trains"
    | "heartbeat-errors"
    | "heartbeat-warnings"
    | "heartbeats";

/**
 * Filters for a `trains` subscription. Each matches any of its values, and missing or empty filters match everything.
 * Like the history, a change is sent if the train's new status matches,
 *  and a train becoming inactive is sent if its previous status matched.
 */
export interface TrainsSubscriptionFilters extends TrainStatusFilters {
    /** Which APIs to include data from. Data from other APIs is omitted, and changes to it are ignored. */
    apis?: readonly TrainDataApi[];
}

/** A subscription to due times for a station. */
export interface StationDueTimesSubscription {
    topic: "station-due-times";
    /** Station code (e.g., `"MMT"`). */
    station: string;
}

/** A subscription to due times for a platform. */
export interface PlatformDueTimesSubscription {
    topic: "platform-due-times";
    /** Platform code (e.g., `"MTW;3"`). */
    platform: PlatformCode;
}

/** A subscription to train status changes. */
export interface TrainsSubscription extends TrainsSubscriptionFilters {
    topic: "trains";
}

/** A subscription to new heartbeat errors or warnings. */
export interface HeartbeatDiagnosticsSubscription {
    topic: "heartbeat-errors" | "heartbeat-warnings";
    /** Which APIs to receive errors or warnings for. If omitted, errors or warnings from all APIs are received. */
    apis?: readonly ApiType[];
}

/** A subscription to events indicating a heartbeat has finished. */
export interface HeartbeatsSubscription {
    topic: "heartbeats";
}

/** A subscription to any topic, without an ID. */
export type Subscription =
    | StationDueTimesSubscription
    | PlatformDueTimesSubscription
    | TrainsSubscription
    | HeartbeatDiagnosticsSubscription
    | HeartbeatsSubscription;

/**
 * A subscription, as returned by the proxy.
 * An ID is generated by the proxy if one is not provided in the request, so this always has an ID.
 * Subscriptions are normalised, so may not be exactly as requested, but will carry the same meaning.
 */
export type SubscriptionResponse = Subscription & {
    /** Identifies the subscription in messages and for removing/replacing it. */
    id: string;
};

/** A subscription to add. */
export type SubscriptionRequest = Subscription & {
    /**
     * Identifies the subscription in messages and for removing/replacing it.
     * Up to 64 letters, digits, hyphens or underscores.
     * If a subscription with this ID already exists, it is replaced.
     * If omitted, an ID is automatically generated by the proxy.
     */
    id?: string;
};

/** The result of adding subscriptions. */
export interface SubscriptionsChange {
    /** All the token's subscriptions, after the change. */
    subscriptions: SubscriptionResponse[];
    /** The IDs of existing subscriptions which were removed, because they are covered by new ones. */
    replaced: string[];
}

/** The result of creating a subscription token. */
export interface CreateTokenResponse extends SubscriptionsChange {
    /**
     * The subscription token, which is needed to manage the subscriptions and receive their messages.
     * Tokens should be treated as secret, as well as ephemeral since they may expire at any time (e.g., if the proxy restarts).
     */
    token: string;
}

/** Details of a subscription token. */
export interface SubscriptionTokenDetails {
    /** All the token's current subscriptions. */
    subscriptions: SubscriptionResponse[];
    /** The number of streams currently connected for the token. */
    streams: number;
    /** When the token will be deleted if it isn't used in time, or null if any streams are currently connected. */
    expiresAt: Date | null;
}

// --- Streams ---

export interface StreamCallbacks {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onScheduleReconnect?: (info: { delay: number }) => void;
}

/** Options for a subscription token's stream. */
export interface SubscriptionStreamOptions<WithSubscriptionIds extends boolean = boolean> {
    /** Whether each message should include the IDs of the subscriptions which it matched. */
    subscriptionIds?: WithSubscriptionIds;
}

/**
 * A message's payload, along with the IDs of the subscriptions it matched if they were requested.
 * The conditional type and `Prettify` make editors show the message's properties, rather than the type's name.
 */
type SubscriptionMessage<Payload, WithSubscriptionIds extends boolean> =
    WithSubscriptionIds extends true
        ? Prettify<Payload & {
            /** The IDs of the subscriptions which this message matched. */
            subscriptionIds: string[];
        }>
        : Prettify<Payload>;

/** A message for a `station-due-times` subscription. */
export type StationDueTimesMessage<WithSubscriptionIds extends boolean = boolean> =
    SubscriptionMessage<{
        /** The station code, as subscribed to. */
        station: string;
        /** The corresponding heartbeat. */
        heartbeat: HeartbeatTimes;
        /** The next trains due at the station, in order of `time.dueIn`. */
        dueTimes: (Omit<StationDueTime, "status"> & { status: CollatedTrain | null })[];
    }, WithSubscriptionIds>;

/** A message for a `platform-due-times` subscription. */
export type PlatformDueTimesMessage<WithSubscriptionIds extends boolean = boolean> =
    SubscriptionMessage<{
        /** The platform code, as subscribed to. */
        platform: PlatformCode;
        /** The corresponding heartbeat. */
        heartbeat: HeartbeatTimes;
        /** The next trains due at the platform, in order of `time.dueIn`. */
        dueTimes: (Omit<PlatformDueTime, "status"> & { status: CollatedTrain | null })[];
    }, WithSubscriptionIds>;

/** A message for a `trains` subscription, sent when a train's status changes, or when it becomes inactive. */
export type TrainMessage<WithSubscriptionIds extends boolean = boolean> =
    SubscriptionMessage<{
        /** The train's TRN. */
        trn: Trn;
        /** The heartbeat during which the status changed. */
        heartbeat: HeartbeatTimes;
        /**
         * The train's new status, or null if it became inactive.
         * This includes the data from each API included by any of the matching subscriptions.
         */
        status: CollatedTrain | null;
    }, WithSubscriptionIds>;

/** A message for a `heartbeat-errors` subscription. The heartbeat's `endedAt` is always null. */
export type HeartbeatErrorMessage<WithSubscriptionIds extends boolean = boolean> =
    SubscriptionMessage<HeartbeatError, WithSubscriptionIds>;

/** A message for a `heartbeat-warnings` subscription. The heartbeat's `endedAt` is always null. */
export type HeartbeatWarningMessage<WithSubscriptionIds extends boolean = boolean> =
    SubscriptionMessage<HeartbeatWarning, WithSubscriptionIds>;

/** A message for a `heartbeats` subscription, sent after all the heartbeat's other messages. */
export type HeartbeatEndMessage<WithSubscriptionIds extends boolean = boolean> =
    SubscriptionMessage<{
        /** The heartbeat which ended. */
        heartbeat: HeartbeatTimes;
    }, WithSubscriptionIds>;

/** Sent just before the proxy closes a stream, after which it won't be reconnected. */
export interface StreamClosedMessage {
    /**
     * `"replaced"` if this was the oldest stream when another connected for the token (see `MAX_STREAMS_PER_TOKEN`).
     *  `"deleted"` if the token was deleted.
     */
    reason: "replaced" | "deleted";
}

export interface SubscriptionStreamCallbacks<WithSubscriptionIds extends boolean = boolean> extends StreamCallbacks {
    /** What to do when receiving a message for a `station-due-times` subscription. */
    onStationDueTimes?: (message: StationDueTimesMessage<WithSubscriptionIds>) => void;
    /** What to do when receiving a message for a `platform-due-times` subscription. */
    onPlatformDueTimes?: (message: PlatformDueTimesMessage<WithSubscriptionIds>) => void;
    /** What to do when receiving a message for a `trains` subscription, sent when a train's status changes, or when it becomes inactive. */
    onTrain?: (message: TrainMessage<WithSubscriptionIds>) => void;
    /** What to do when receiving a message for a `heartbeat-errors` subscription. The heartbeat's `endedAt` is always null. */
    onHeartbeatError?: (message: HeartbeatErrorMessage<WithSubscriptionIds>) => void;
    /** What to do when receiving a message for a `heartbeat-warnings` subscription. The heartbeat's `endedAt` is always null. */
    onHeartbeatWarning?: (message: HeartbeatWarningMessage<WithSubscriptionIds>) => void;
    /** What to do when receiving a message for a `heartbeats` subscription, sent after all the heartbeat's other messages. */
    onHeartbeatEnd?: (message: HeartbeatEndMessage<WithSubscriptionIds>) => void;
    /** What to do when the proxy intentionally closes the stream. */
    onStreamClosed?: (message: StreamClosedMessage) => void;
}
