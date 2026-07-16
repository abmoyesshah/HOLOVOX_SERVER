import { NextResponse } from "../../../../utils/next-response.js";
import Stripe from "stripe";
import connectDB from "../../../../lib/db.js";
import Product from "../../../models/Product.js";
import ReferalCode from "../../../models/ReferalCodes.model.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    // ✅ shippingCost bhi le rahe hain ab
    const { items, shipping, shippingCost, discountPercentage, referralCode } =
      await req.json();

    // DEBUG: Log everything
    console.log("=".repeat(50));
    console.log(
      "📦 Creating checkout for items:",
      JSON.stringify(items, null, 2),
    );
    console.log("🎯 Discount percentage:", discountPercentage);
    console.log("🎫 Referral code:", referralCode);
    console.log("📦 Shipping cost (dollars):", shippingCost);
    console.log("=".repeat(50));

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    await connectDB();

    // Fetch products from DB
    const productIds = items.map((i) => i.id);
    const products = await Product.find({ _id: { $in: productIds } });

    console.log("🛒 Products found in DB:", products.length);

    if (products.length === 0) {
      return NextResponse.json(
        { error: "Products not found in database" },
        { status: 404 },
      );
    }

    // ✅ Referral code usage increment (if provided)
    if (referralCode) {
      const code = await ReferalCode.findOne({ code: referralCode });
      if (code) {
        await ReferalCode.findOneAndUpdate(
          { code: referralCode },
          { $inc: { usedCount: 1 } },
        );
        console.log(`📊 Referral code ${referralCode} usage incremented`);
      }
    }

    // 🔥 Line items for products (with discount)
    const lineItems = items.map((item) => {
      const dbProduct = products.find((p) => p._id.toString() === item.id);
      if (!dbProduct) {
        throw new Error(`Product ${item.id} not found in database`);
      }

      let unitAmount = dbProduct.price; // already in cents

      // Apply discount if available
      if (discountPercentage && discountPercentage > 0) {
        const discountMultiplier = 1 - discountPercentage / 100;
        unitAmount = Math.round(dbProduct.price * discountMultiplier);
        console.log(
          `💰 ${dbProduct.name}: Original: ${dbProduct.price}¢ → Discounted: ${unitAmount}¢ (${discountPercentage}% off)`,
        );
      } else {
        console.log(
          `💰 ${dbProduct.name}: Price: ${dbProduct.price}¢ (No discount)`,
        );
      }

      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: dbProduct.name,
            description: dbProduct.description || "",
          },
          unit_amount: unitAmount,
        },
        quantity: item.qty,
      };
    });

    // ✅ ✅ ✅ SHIPPING AS A LINE ITEM (if shippingCost > 0)
    if (shippingCost && shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Shipping",
            description: `Shipping to ${shipping?.country || "your address"}`,
          },
          unit_amount: Math.round(shippingCost * 100), // convert dollars to cents
        },
        quantity: 1,
      });
      console.log(`📦 Shipping added: $${shippingCost}`);
    }

    // Calculate totals (for logging/metadata)
    const subtotal = items.reduce((sum, item) => {
      const dbProduct = products.find((p) => p._id.toString() === item.id);
      return sum + (dbProduct ? dbProduct.price : 0) * item.qty;
    }, 0);

    const discountedSubtotal = lineItems
      .filter((item) => item.price_data.product_data.name !== "Shipping") // only products
      .reduce((sum, item, index) => {
        // but careful: index not correct because we filtered; better recompute from items
        // simpler: just use items and discount
        return sum + item.price_data.unit_amount * (items[index]?.qty || 0);
      }, 0);
    // Actually the above is not perfect; we'll just compute simple:
    // We'll compute discountedSubtotal from original items with discount
    let discountedProductsTotal = 0;
    items.forEach((item) => {
      const dbProduct = products.find((p) => p._id.toString() === item.id);
      if (dbProduct) {
        let price = dbProduct.price;
        if (discountPercentage && discountPercentage > 0) {
          price = Math.round(dbProduct.price * (1 - discountPercentage / 100));
        }
        discountedProductsTotal += price * item.qty;
      }
    });

    console.log(`💰 Original subtotal: $${(subtotal / 100).toFixed(2)}`);
    console.log(
      `💰 Discounted subtotal (products only): $${(discountedProductsTotal / 100).toFixed(2)}`,
    );
    console.log(
      `💰 Discount applied: $${((subtotal - discountedProductsTotal) / 100).toFixed(2)}`,
    );
    console.log(`📦 Total with shipping: $${((discountedProductsTotal + (shippingCost || 0) * 100) / 100).toFixed(2)}`);

    // 🔥 Stripe session create
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.holovox.io"}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.holovox.io"}/hardware/checkout`,
      metadata: {
        shipping: JSON.stringify(shipping || {}),
        items: JSON.stringify(items.map((i) => ({ id: i.id, qty: i.qty }))),
        subtotal: subtotal.toString(),
        discountedSubtotal: discountedProductsTotal.toString(),
        discountPercentage: (discountPercentage || 0).toString(),
        referralCode: referralCode || "",
        shippingCost: (shippingCost || 0).toString(),
      },
    });

    console.log("✅ Stripe session created:", session.id);
    console.log("=".repeat(50));

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("❌ Create checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout" },
      { status: 500 },
    );
  }
}


// import { NextResponse } from "../../../../utils/next-response.js";
// import Stripe from "stripe";
// import connectDB from "../../../../lib/db.js";
// import Product from "../../../models/Product.js";
// import ReferalCode from "../../../models/ReferalCodes.model.js";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// export async function POST(req) {
//   try {
//     const { items, shipping, discountPercentage, referralCode } =
//       await req.json();

//     // DEBUG: Log everything
//     console.log("=".repeat(50));
//     console.log(
//       "📦 Creating checkout for items:",
//       JSON.stringify(items, null, 2),
//     );
//     console.log("🎯 Discount percentage:", discountPercentage);
//     console.log("🎫 Referral code:", referralCode);
//     console.log("=".repeat(50));

//     if (!items || items.length === 0) {
//       return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
//     }

//     await connectDB();

//     // 🔥 Database se products fetch karo (price verify)
//     const productIds = items.map((i) => i.id);
//     const products = await Product.find({ _id: { $in: productIds } });

//     console.log("🛒 Products found in DB:", products.length);

//     if (products.length === 0) {
//       return NextResponse.json(
//         { error: "Products not found in database" },
//         { status: 404 },
//       );
//     }

//     // If referral code is provided, verify and increment usage
//     if (referralCode) {
//       const code = await ReferalCode.findOne({ code: referralCode });
//       if (code) {
//         await ReferalCode.findOneAndUpdate(
//           { code: referralCode },
//           { $inc: { usedCount: 1 } },
//         );
//         console.log(`📊 Referral code ${referralCode} usage incremented`);
//       }
//     }

//     // 🔥 Line items with discount applied
//     const lineItems = items.map((item) => {
//       const dbProduct = products.find((p) => p._id.toString() === item.id);
//       if (!dbProduct) {
//         throw new Error(`Product ${item.id} not found in database`);
//       }

//       // Get the price (ensure it's in cents)
//       let unitAmount = dbProduct.price;

//       // Apply discount if available
//       if (discountPercentage && discountPercentage > 0) {
//         const discountMultiplier = 1 - discountPercentage / 100;
//         unitAmount = Math.round(dbProduct.price * discountMultiplier);
//         console.log(
//           `💰 ${dbProduct.name}: Original: ${dbProduct.price}¢ → Discounted: ${unitAmount}¢ (${discountPercentage}% off)`,
//         );
//       } else {
//         console.log(
//           `💰 ${dbProduct.name}: Price: ${dbProduct.price}¢ (No discount)`,
//         );
//       }

//       return {
//         price_data: {
//           currency: "usd",
//           product_data: {
//             name: dbProduct.name,
//             description: dbProduct.description || "",
//           },
//           unit_amount: unitAmount,
//         },
//         quantity: item.qty,
//       };
//     });

//     // Calculate totals
//     const subtotal = items.reduce((sum, item) => {
//       const dbProduct = products.find((p) => p._id.toString() === item.id);
//       return sum + (dbProduct ? dbProduct.price : 0) * item.qty;
//     }, 0);

//     const discountedSubtotal = lineItems.reduce((sum, item, index) => {
//       return sum + item.price_data.unit_amount * items[index].qty;
//     }, 0);

//     console.log(`💰 Original subtotal: $${(subtotal / 100).toFixed(2)}`);
//     console.log(
//       `💰 Discounted subtotal: $${(discountedSubtotal / 100).toFixed(2)}`,
//     );
//     console.log(
//       `💰 Discount applied: $${((subtotal - discountedSubtotal) / 100).toFixed(2)}`,
//     );
// //const appUrl = 'http://localhost:5173'  // Your Vite frontend
    
//     // console.log(`🌐 Using app URL: ${appUrl}`);
//     // 🔥 Stripe session create
//     const session = await stripe.checkout.sessions.create({
//       mode: "payment",
//       line_items: lineItems,
//       success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.holovox.io"}/success?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.holovox.io"}/hardware/checkout`,
//       // In create-checkout route, update metadata
//       metadata: {
//         shipping: JSON.stringify(shipping || {}),
//         items: JSON.stringify(items.map((i) => ({ id: i.id, qty: i.qty }))),
//         subtotal: subtotal.toString(),
//         discountedSubtotal: discountedSubtotal.toString(),
//         discountPercentage: (discountPercentage || 0).toString(),
//         referralCode: referralCode || "",
//       },
//     });

//     console.log("✅ Stripe session created:", session.id);
//     console.log("=".repeat(50));

//     return NextResponse.json({ url: session.url });
//   } catch (error) {
//     console.error("❌ Create checkout error:", error);
//     return NextResponse.json(
//       { error: error.message || "Failed to create checkout" },
//       { status: 500 },
//     );
//   }
// }
