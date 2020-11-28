# Payfiat Server

> Node.js server for [Payfiat payment service](https://github.com/akshay-ap/payfiat)

### Usage

1. copy and create `.env` file
   `cp .env.example .env`

1. Fill add `.env` details correctly. Payfiat server uses [Stripe](https://stripe.com/) as fiat payment processor. So, you will need to create stripe account to get api keys.

1. install node dependencies
   `npm i`

1. start server
   `npm start`

## Configuring OCEAN tokens

In `.env` file, replace value of `WEB3_NODE` variable with appropriate web3 provider for a given network (for e.g.) Pacific, Mainnet, Rinkeby etc.

Also, provide appropriate value for -

- `OCEAN_CONTRACT_ADDRESS` - Ocean Token contract address for a given network.
- `OCEAN_FROM_KEY` - Private key without '0x' for a funding Wallet
- `OCEAN_FROM_ADDRESS` - Ethereum address for a funding Wallet
