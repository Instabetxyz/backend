# Instabet Backend

## Project structure
```
streambet-api/
├── src/
│   ├── config/
│   │   ├── index.ts          # env vars, typed config object
│   │   └── contracts.ts      # ABI imports + contract addresses
│   ├── db/
│   │   ├── client.ts         # postgres pool (pg)
│   │   ├── redis.ts          # redis client (ioredis)
│   │   └── migrations/
│   │       └── 001_initial.sql
│   ├── types/
│   │   └── index.ts          # all shared types/interfaces
│   ├── middleware/
│   │   ├── auth.ts           # JWT verify, attach req.user
│   │   └── errorHandler.ts   # global error handler
│   ├── services/
│   │   ├── trio.ts           # Trio API client (validate, live-monitor)
│   │   ├── chain.ts          # ethers.js wrapper (read/write contracts)
│   │   ├── market.ts         # market business logic
│   │   ├── agent.ts          # agent business logic
│   │   └── cre.ts            # Chainlink CRE workflow trigger
│   ├── routes/
│   │   ├── streams.ts        # POST /stream
│   │   ├── markets.ts        # GET /markets, GET /markets/:id, POST /markets/:id/bet
│   │   ├── agents.ts         # GET/POST /agents, GET /agents/:id, POST /agents/:id/follow
│   │   └── webhooks.ts       # POST /webhook/trio
│   ├── websocket/
│   │   └── server.ts         # WS server, subscription manager, event emitter
│   └── app.ts                # express app setup + route mounting
├── contracts/
│   ├── abis/
│   │   ├── MarketFactory.json
│   │   ├── PredictionMarket.json
│   │   └── AgentRegistry.json
├── index.ts                  # entrypoint, starts http + ws
├── package.json
├── tsconfig.json
└── .env.example
```


TODO:
- test inference with 0G
- test calling trio API
- implement these endpoints
- test the flow for prediction market creation, betting first with API endpoints

- deploy smart contract
- implement APIs for getting markets, etc
- implement CRE for resolving the market

agent should be a self-contained unit utilizing 0G that interacts with this server and bets on markets:
- create dockerfile with agent betting on outcome