const express = require("express");
const router = express.Router();
const Web3 = require("web3");
const BigNumber = require("bignumber.js");
const allTokens = require("../tokens");
const erc20 = require("../abi/ERC20.json");
const axios = require("axios");
const { sendTx } = require("../utils/signer");

let web3 = new Web3(process.env.WEB3_NODE);

router.get("/balance", async (req, res, next) => {
  try {
    console.log(req.query.token);
    let balance = 0;
    let { token, senderAddress } = req.query;
    if (token == "ETH") {
      let bal = await web3.eth.getBalance(senderAddress);
      balance = readableBalance(bal, 18);
      console.log(balance);
    } else {
      let selectedToken = allTokens.find(t => t.symbol == token);
      //if token doesn't exists
      if (!selectedToken) {
        res
          .status(404)
          .json({ message: `Token ${token} is currently not supported` });
      }

      const tokenContract = new web3.eth.Contract(erc20, selectedToken.address);
      let bal = await tokenContract.methods.balanceOf(senderAddress).call();
      balance = readableBalance(bal, selectedToken.decimals);
    }
    res.status(200).json({ balance });
  } catch (error) {
    res.status(500).json({ message: "Oops! Some error occured" });
    console.error(error);
  }
});

router.get("/currentPrice", async (req, res, next) => {
  let price = 0;
  try {
    let { contractAddress, currency } = req.query;
    let resp = await axios.get(
      "https://api.coingecko.com/api/v3/simple/token_price/ethereum",
      {
        params: {
          contract_addresses: contractAddress,
          vs_currencies: currency
        }
      }
    );

    let data = resp.data;
    console.log(data[contractAddress][currency.toLowerCase()]);
    price = data[contractAddress][currency.toLowerCase()];
  } catch (err) {
    console.error(err.message);
  }

  res.status(200).json({ price });
});

router.get("/checkTxStatus", async (req, res, next) => {
  try {
    let { txHash } = req.query;
    console.log(`checking tx receipt for ${txHash}`)
    const receipt = await web3.eth.getTransactionReceipt(txHash);
    console.log(receipt)
    if (receipt) {

      if (receipt.status) {
        //transfer is successful
        res.status(200).json({ status: "success" });
      }
      else if (receipt.status === null) {
        //not processed yet
        res.status(200).json({ status: "waiting" });
      }
      else if (receipt.status) {
        //not processed yet
        res.status(200).json({ status: "fail" });
      }
    } else {
      res.status(500).json({ message: `unable to retrieve receipt for tx - ${txHash}` });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.error(error.message);
  }
});

function readableBalance(preformattedAmount, decimals) {
  let bn = new BigNumber(Number(preformattedAmount));
  let tokenUnit = new BigNumber(10);
  tokenUnit = tokenUnit.pow(-1 * decimals);
  return bn.multipliedBy(tokenUnit).toPrecision();
}

function parseAmount(preformattedAmount, decimals) {
  let bn = new BigNumber(Number(preformattedAmount));
  let tokenUnit = new BigNumber(10);
  tokenUnit = tokenUnit.pow(decimals);
  let value = bn.multipliedBy(tokenUnit).toPrecision();
  return value;
}

module.exports = router;
