import { NextResponse } from "next/server";
import Stripe from "stripe";
import connectDB from "../../../../lib/db";
import Product from "../../../models/Product";
import Bundle from "../../../models/bundle.model";
import ReferalCode from "../../../models/ReferalCodes.model";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { items, shipping, shippingCost, discountPercentage, referralCode } =
      await req.json();

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

    // ✅ Separate regular products and bundles
    const productItems = [];
    const bundleItems = [];

    for (const item of items) {
      const isBundle = item.id && item.id.toLowerCase().includes('bundle');
      if (isBundle) {
        bundleItems.push(item);
      } else {
        productItems.push(item);
      }
    }

    console.log(`📦 Regular products: ${productItems.length}, Bundles: ${bundleItems.length}`);

    // ✅ Fetch regular products from DB
    const productIds = productItems.map((i) => i.id);
    const products = await Product.find({ _id: { $in: productIds } });

    // ✅ Fetch bundles from DB
    const bundleIds = bundleItems.map((i) => i.id);
    const bundles = await Bundle.find({ _id: { $in: bundleIds } });

    console.log(`🛒 Products found: ${products.length}, Bundles found: ${bundles.length}`);

    // ✅ Check if products exist (only if there are product items)
    if (productItems.length > 0 && products.length === 0) {
      return NextResponse.json(
        { error: "Products not found in database" },
        { status: 404 },
      );
    }

    // ✅ Check if bundles exist (only if there are bundle items)
    if (bundleItems.length > 0 && bundles.length === 0) {
      return NextResponse.json(
        { error: "Bundles not found in database" },
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

    // ✅ Build line items
    const lineItems = [];

    // 1. Add regular products
    for (const item of productItems) {
      const dbProduct = products.find((p) => p._id.toString() === item.id);
      if (!dbProduct) {
        console.error(`❌ Product ${item.id} not found in database`);
        continue;
      }

      let unitAmount = dbProduct.price;

      if (discountPercentage && discountPercentage > 0) {
        const discountMultiplier = 1 - discountPercentage / 100;
        unitAmount = Math.round(dbProduct.price * discountMultiplier);
        console.log(
          `💰 ${dbProduct.name}: Original: ${dbProduct.price}¢ → Discounted: ${unitAmount}¢ (${discountPercentage}% off)`,
        );
      } else {
        console.log(`💰 ${dbProduct.name}: Price: ${dbProduct.price}¢`);
      }

      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: dbProduct.name,
            description: dbProduct.description || "",
          },
          unit_amount: unitAmount,
        },
        quantity: item.qty,
      });
    }

    // 2. Add bundles
    for (const item of bundleItems) {
      const dbBundle = bundles.find((b) => b._id.toString() === item.id);
      if (!dbBundle) {
        console.error(`❌ Bundle ${item.id} not found in database`);
        continue;
      }

      let unitAmount = dbBundle.price;
      
      // ✅ Convert bundle price to cents (if in dollars)
      if (unitAmount < 1000) {
        unitAmount = Math.round(unitAmount * 100);
        console.log(`💰 Bundle ${dbBundle.name}: Converted $${dbBundle.price} to ${unitAmount}¢`);
      }

      if (discountPercentage && discountPercentage > 0) {
        const discountMultiplier = 1 - discountPercentage / 100;
        unitAmount = Math.round(unitAmount * discountMultiplier);
        console.log(
          `💰 Bundle ${dbBundle.name}: Discounted: ${unitAmount}¢ (${discountPercentage}% off)`,
        );
      } else {
        console.log(`💰 Bundle ${dbBundle.name}: Price: ${unitAmount}¢`);
      }

      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: dbBundle.name,
            description: dbBundle.description || "Curated bundle with special pricing",
          },
          unit_amount: unitAmount,
        },
        quantity: item.qty,
      });
    }

    // 3. Add shipping if cost > 0
    if (shippingCost && shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Shipping",
            description: `Shipping to ${shipping?.country || "your address"}`,
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
      console.log(`📦 Shipping added: $${shippingCost}`);
    }

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "No valid items to checkout. Products or bundles not found." },
        { status: 404 },
      );
    }

    // ✅ Calculate totals for metadata
    let subtotal = 0;
    productItems.forEach((item) => {
      const dbProduct = products.find((p) => p._id.toString() === item.id);
      if (dbProduct) {
        subtotal += dbProduct.price * item.qty;
      }
    });
    bundleItems.forEach((item) => {
      const dbBundle = bundles.find((b) => b._id.toString() === item.id);
      if (dbBundle) {
        let price = dbBundle.price;
        if (price < 1000) {
          price = Math.round(price * 100);
        }
        subtotal += price * item.qty;
      }
    });

    let discountedProductsTotal = 0;
    productItems.forEach((item) => {
      const dbProduct = products.find((p) => p._id.toString() === item.id);
      if (dbProduct) {
        let price = dbProduct.price;
        if (discountPercentage && discountPercentage > 0) {
          price = Math.round(dbProduct.price * (1 - discountPercentage / 100));
        }
        discountedProductsTotal += price * item.qty;
      }
    });
    bundleItems.forEach((item) => {
      const dbBundle = bundles.find((b) => b._id.toString() === item.id);
      if (dbBundle) {
        let price = dbBundle.price;
        if (price < 1000) {
          price = Math.round(price * 100);
        }
        if (discountPercentage && discountPercentage > 0) {
          price = Math.round(price * (1 - discountPercentage / 100));
        }
        discountedProductsTotal += price * item.qty;
      }
    });

    console.log(`💰 Original subtotal: $${(subtotal / 100).toFixed(2)}`);
    console.log(
      `💰 Discounted subtotal: $${(discountedProductsTotal / 100).toFixed(2)}`,
    );
    console.log(
      `💰 Discount applied: $${((subtotal - discountedProductsTotal) / 100).toFixed(2)}`,
    );
    console.log(
      `📦 Total with shipping: $${((discountedProductsTotal + (shippingCost || 0) * 100) / 100).toFixed(2)}`,
    );

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
        hasBundle: (bundleItems.length > 0).toString(),
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