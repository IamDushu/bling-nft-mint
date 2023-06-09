const express = require("express")
const app = express()
const getRawBody = require("raw-body")
const crypto = require("crypto")

const { ThirdwebSDK } = require("@thirdweb-dev/sdk")
const { Shopify, DataType } = require("@shopify/shopify-api")

require("dotenv").config()
const secretKey = process.env.SHOPIFY_SECRET_KEY

app.get("/webhooks/orders/create", (req, res) => {
  res.send("GET REQUEST Called")
  console.log("GET")
})

// Listen for requests to the /webhooks/orders/create route
app.post("/webhooks/orders/create", async (req, res) => {
    console.log("Order event received!")
  // Below, we're verifying the webhook was sent from Shopify and not a potential attacker
  // Learn more here: https://shopify.dev/apps/webhooks/configuration/https#step-5-verify-the-webhook
  const hmac = req.get("x-shopify-hmac-sha256")
  const body = await getRawBody(req)
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(body, "utf8", "hex")
    .digest("base64")

  // Compare our hash to Shopify's hash
  if (hash === hmac) {
        console.log("Inside If Loop")
    
    // Create a new client for the specified shop.
    const client = new Shopify.Clients.Rest(
      process.env.SHOPIFY_SITE_URL,
      process.env.SHOPIFY_ACCESS_TOKEN
    )

    const shopifyOrderId = req.get("x-shopify-order-id")

    const response = await client.get({
      type: DataType.JSON,
      path: `/admin/api/2023-04/orders/${shopifyOrderId}.json`,
    })
    
    const itemsPurchased = response.body.order.line_items
    

    const sdk = ThirdwebSDK.fromPrivateKey(process.env.ADMIN_PRIVATE_KEY, "goerli")

    const nftCollection = await sdk.getContract(
      process.env.NFT_COLLECTION_ADDRESS,
      "nft-collection"
    )

    // For each item purchased, mint the wallet address an NFT
    for (const item of itemsPurchased) {
      // Grab the information of the product ordered
      const productQuery = await client.get({
        type: DataType.JSON,
        path: `/admin/api/2023-04/products/${item.product_id}.json`,
      })
      

      // Set the metadata for the NFT to the product information
      const metadata = {
        name: productQuery.body.product.title,
        description: productQuery.body.product.body_html.replace("<span>", "").replace("</span>", ""),
        image: productQuery.body.product.image.src,
      }

      const myItem = response.body.order.line_items[0]
      const myWallet = myItem.properties[0]
      const walletAddress = myWallet.value

      // Mint the NFT
      const minted = await nftCollection.mintTo(walletAddress, metadata)

      console.log("Successfully minted NFTs!", minted)
    }
    res.sendStatus(200)
  } else {
    res.sendStatus(403)
  }
})

app.listen(3000, () => console.log("Example app listening on port 3000!"))

