# metro-api-client

A client library for my [Tyne and Wear Metro API proxy and data aggregator](https://github.com/hopperelec/metro-api-client).

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

const baseUrl = 'http://localhost:3000/api'; // Replace with your proxy API URL
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
