# metro-api-client

A client library for my [Tyne and Wear Metro API proxy and data aggregator](https://github.com/hopperelec/tnw-metro-api).

## Installation

```bash
npm install metro-api-client
# or
yarn add metro-api-client
# or
pnpm add metro-api-client
```

## Basic Usage

```typescript
import { MetroApiClient } from 'metro-api-client';

// Replace with your proxy's URL. This shouldn't include the API version (e.g. `/v1`), since the client adds it itself.
const baseUrl = 'http://localhost:3000/api';
const client = new MetroApiClient(baseUrl);

// Example: Fetch all active trains
const trains = await client.getTrains();
console.log(trains.trains);

// Example: Stream updates to a specific train
const { token } = await client.createSubscriptionToken([{ topic: "trains", trns: ["121"] }]);
client.streamSubscriptions(token, {
    onTrain: (data) => {
        console.log(data);
    }
})
```

## Deprecation

Each version of this library uses a specific version of the proxy's API.
If major changes are made to the proxy's API, the proxy might deprecate that version.
This client will log a warning the first time it notices that version is deprecated.
To override this behaviour, such as to send it to your own logs, pass `onDeprecation`:

```typescript
const client = new MetroApiClient(baseUrl, {
    onDeprecation: ({ sunset, link }) => {
        myLogger.warn(
            `metro-api-client needs updating (stops working: ${sunset?.toISOString() ?? 'unknown'}, ` +
            `more information: ${link ?? 'none'})`
        );
    }
});
```
