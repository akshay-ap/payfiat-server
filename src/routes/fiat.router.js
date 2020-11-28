require("dotenv").config();
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Web3 = require("web3");
let web3 = new Web3(process.env.WEB3_NODE);
const { sendTx } = require("../utils/signer");
const abi = require("../abi/token.json");
const { parseAmount } = require("../utils/formatter");

router.get("/public-key", (req, res) => {
  res.send({ publicKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

router.post("/create-payment-intent", async (req, res) => {
  const body = req.body;
  const options = {
    amount: body.amount,
    currency: body.currency,
    description: body.description,
    payment_method_types: body.payment_method_types,
    shipping: body.shipping,
    receipt_email: body.email,
    "metadata[price]": body.metadata.price,
    "metadata[tokenAmount]": body.metadata.tokenAmount,
    "metadata[tokenId]": body.metadata.tokenId,
    "metadata[recieverAddress]": body.metadata.recieverAddress,
    "metadata[txState]": "not_started",
  };
  console.log("/create-payment-intent", options);

  try {
    const paymentIntent = await stripe.paymentIntents.create(options);
    console.log(paymentIntent);
    res.status(200).json(paymentIntent);
  } catch (err) {
    res.status(500).json(err);
    console.error(err.message);
  }
});

router.post("/tx-hash", async (req, res) => {
  console.log("/tx-hash", req.body);
  const paymentId = req.body.paymentId;
  if (!paymentId) {
    res.status(400).json({ message: "Missing parameter in request body" });
    return;
  }
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);

    console.log(`Metadata for [${paymentId}]`, paymentIntent.metadata);
    if (!paymentIntent.metadata) {
      res.status(400).json({ message: "No transaction state data found" });
    } else {
      res.status(200).json({
        transactionHash: paymentIntent.metadata.transactionHash || "undefined",
        txState: paymentIntent.metadata.txState,
      });
    }
  } catch (error) {
    console.error(`Unable to get tx hash for [${paymentId}]`, error);
    res.status(400).json({ message: err.message });
  }
});

const transferToken = async (receiverAddress, amount) => {
  let oceanContractAddress = process.env.OCEAN_CONTRACT_ADDRESS;

  try {
    //create token instance from abi and contract address
    const tokenInstance = new web3.eth.Contract(abi, oceanContractAddress);
    let amt = parseAmount(amount).toString();
    console.log(amt);
    var txData = await tokenInstance.methods
      .transfer(receiverAddress, amt)
      .encodeABI();
    let txHash = await sendTx(
      txData,
      process.env.OCEAN_FROM_ADDRESS,
      oceanContractAddress,
      0
    );

    return txHash;
  } catch (err) {
    res.status(500).json({ message: err.message });
    console.error(err.message);
  }
};

// Webhook handler for asynchronous events.
router.post("/webhook", async (req, res) => {
  let data;
  let eventType;
  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;

    let signature = req.headers["stripe-signature"];
    let rawb = req.rawBody;
    // try {
    //   event = stripe.webhooks.constructEvent(
    //     rawB,
    //     signature,
    //     process.env.STRIPE_WEBHOOK_SECRET
    //   );
    // } catch (err) {
    //   console.log(`⚠️ Webhook signature verification failed.`);
    //   return res.sendStatus(400);
    // }
    // Extract the object from the event.
    console.log("body", req.body);
    try {
      event = req.body;
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
    data = event.data.object;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // retrieve the event data directly from the request body.
    data = event.data.object;
    eventType = req.body.type;
  }

  console.log("event type", eventType);
  if (eventType === "payment_intent.succeeded") {
    console.log(`Payment received: ${data.id}`);
    let recieverAddress = data.metadata.recieverAddress;
    let tokenAmount = data.metadata.tokenAmount;
    let parsedTokenAmount = 0;
    let isValid = true;

    stripe.paymentIntents
      .update(data.id, {
        metadata: { ...data.metadata, txState: "Starting" },
      })
      .then((result) => console.log("Payment intent [txState] updated"))
      .catch((error) => {
        console.log(`Error updating txState for [${data.id}]`, error);
      });

    try {
      parsedTokenAmount = data.metadata.tokenAmount;
    } catch (error) {
      isValid = false;
      console.error(
        `ID:[${data.id}]: Token amount [${tokenAmount}] not valid in metadata`
      );
    }

    if (!web3.utils.isAddress(recieverAddress)) {
      console.error(
        `ID:[${data.id}]: Reciever address [${recieverAddress}] not valid in metadata`
      );
      isValid = false;
    }
    if (isValid) {
      transferToken(recieverAddress, tokenAmount)
        .then((txnHash) => {
          console.log(`ID:[${data.id}]: Token transfer ${txnHash}`);
          stripe.paymentIntents
            .update(data.id, {
              metadata: {
                ...data.metadata,
                transactionHash: txnHash,
                txState: "started",
              },
            })
            .then(() =>
              console.log("Payment intent txState updated to [started]")
            )
            .catch((error) => {
              console.log(`Error updating [${data.id}]`, error);
            });
        })
        .catch((error) => {
          console.error("Token transfer failed", error);
        });
    }
  }
  if (eventType === "payment_intent.payment_failed") {
    console.log("Payment failed.");
  }

  res.sendStatus(200);
});

module.exports = router;
