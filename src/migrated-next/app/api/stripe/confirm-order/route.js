import { NextResponse } from "../../../../utils/next-response.js";
import Stripe from "stripe";
import connectDB from "../../../../lib/db.js";
import Order from "../../../models/Order.js";
import Product from "../../../models/Product.js";
import { sendAdminOrderEmail } from "../../../../lib/stripe-order-confirm-mail.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { session_id } = await req.json();
    console.log("🔍 Confirm-order called with session_id:", session_id);
    
    if (!session_id) {
      console.log("❌ No session_id provided");
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    console.log("📡 Connecting to database...");
    await connectDB();

    // Check if order already exists
    const existingOrder = await Order.findOne({ stripeSessionId: session_id }).lean();
    if (existingOrder) {
      console.log("✅ Order already exists:", existingOrder._id);
      return NextResponse.json({
        success: true,
        orderId: existingOrder._id,
        message: "Order already exists",
        alreadyExists: true
      });
    }

    console.log("🔍 Verifying session with Stripe...");
    const session = await stripe.checkout.sessions.retrieve(session_id);
    console.log("💳 Session payment_status:", session.payment_status);
    
    if (session.payment_status !== "paid") {
      console.log("❌ Payment not completed");
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    // Get metadata from session
    const shipping = JSON.parse(session.metadata.shipping || "{}");
    const items = JSON.parse(session.metadata.items || "[]");
    const discountPercentage = parseFloat(session.metadata.discountPercentage || "0");
    const referralCode = session.metadata.referralCode || "";
    const shippingCost = parseFloat(session.metadata.shippingCost || "0"); // ✅ FIX 1: Read shippingCost

    console.log("📦 Items from metadata:", items);
    console.log("🎯 Discount percentage:", discountPercentage);
    console.log("🎫 Referral code:", referralCode);
    console.log("📦 Shipping cost:", shippingCost);

    const productIds = items.map(i => i.id);
    const products = await Product.find({ _id: { $in: productIds } });
    console.log(`🛒 Found ${products.length} products in database`);

    let subtotal = 0;
    let discountedSubtotal = 0;
    
    const orderItems = items.map(item => {
      const product = products.find(p => p._id.toString() === item.id);
      const originalPrice = product ? product.price / 100 : 0;
      
      let finalPrice = originalPrice;
      if (discountPercentage > 0) {
        finalPrice = originalPrice * (1 - discountPercentage / 100);
        finalPrice = Math.round(finalPrice * 100) / 100;
      }
      
      subtotal += originalPrice * item.qty;
      discountedSubtotal += finalPrice * item.qty;
      
      return {
        productId: String(product ? product._id : item.id),
        name: product?.name || "Unknown Product",
        originalPrice: originalPrice,
        price: finalPrice,
        quantity: item.qty,
        discountApplied: discountPercentage,
      };
    });

    // ✅ FIX 2: Add shipping cost to total
    const total = discountedSubtotal + shippingCost;

    console.log(`💰 Subtotal: $${subtotal.toFixed(2)}`);
    console.log(`💰 Discounted Subtotal: $${discountedSubtotal.toFixed(2)}`);
    console.log(`📦 Shipping: $${shippingCost.toFixed(2)}`);
    console.log(`💰 Total (with shipping): $${total.toFixed(2)}`);

    // Create order
    let order;
    try {
      console.log("💾 Creating order...");
      order = await Order.create({
        items: orderItems,
        subtotal: subtotal,
        discount: subtotal - discountedSubtotal,
        discountPercentage: discountPercentage,
        referralCode: referralCode || null,
        shippingCost: shippingCost, // ✅ FIX 3: Store shipping cost in order
        total: total,
        stripeSessionId: session_id,
        status: "completed",
        shipping: {
          firstName: shipping.firstName || "",
          lastName: shipping.lastName || "",
          email: shipping.email || "",
          phone: shipping.phone || "",
          address: shipping.address || "",
          city: shipping.city || "",
          state: shipping.state || "",
          zip: shipping.zip || "",
          country: shipping.country || "United States",
        },
      });
      console.log("✅ Order saved:", order._id);
    } catch (createError) {
      if (createError.code === 11000) {
        console.log("⚠️ Duplicate key error, fetching existing order...");
        const existing = await Order.findOne({ stripeSessionId: session_id });
        if (existing) {
          console.log("✅ Found existing order:", existing._id);
          return NextResponse.json({
            success: true,
            orderId: existing._id,
            message: "Order already exists",
            alreadyExists: true
          });
        }
      }
      throw createError;
    }

    // Update product quantities
    console.log("📦 Updating product quantities...");
    for (const item of items) {
      const product = await Product.findById(item.id);
      if (product) {
        const oldQuantity = product.quantity;
        const newQuantity = Math.max(0, oldQuantity - item.qty);
        
        await Product.findByIdAndUpdate(
          item.id,
          { quantity: newQuantity },
          { new: true }
        );
        
        console.log(`📦 ${product.name}: ${oldQuantity} → ${newQuantity} (ordered: ${item.qty})`);
      } else {
        console.warn(`⚠️ Product not found for ID: ${item.id}`);
      }
    }

    // Send admin email
    try {
      await sendAdminOrderEmail(order);
      console.log("📧 Admin email sent successfully");
    } catch (emailError) {
      console.error("❌ Admin email failed:", emailError);
    }

    return NextResponse.json({
      success: true,
      orderId: order._id,
      message: "Order placed successfully!",
    });
  } catch (error) {
    console.error("❌ Confirm order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to confirm order" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: "Confirm-order API is working!",
    timestamp: new Date().toISOString()
  });
}


// import { NextResponse } from "../../../../utils/next-response.js";
// import Stripe from "stripe";
// import connectDB from "../../../../lib/db.js";
// import Order from "../../../models/Order.js";
// import Product from "../../../models/Product.js";
// import { sendAdminOrderEmail } from "../../../../lib/stripe-order-confirm-mail.js";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// export async function POST(req) {
//   try {
//     const { session_id } = await req.json();
//     console.log("🔍 Confirm-order called with session_id:", session_id);
    
//     if (!session_id) {
//       console.log("❌ No session_id provided");
//       return NextResponse.json({ error: "Session ID required" }, { status: 400 });
//     }

//     console.log("📡 Connecting to database...");
//     await connectDB();

//     // 🔥 CHECK IF ORDER ALREADY EXISTS - Use lean() for faster query
//     const existingOrder = await Order.findOne({ stripeSessionId: session_id }).lean();
//     if (existingOrder) {
//       console.log("✅ Order already exists:", existingOrder._id);
//       return NextResponse.json({
//         success: true,
//         orderId: existingOrder._id,
//         message: "Order already exists",
//         alreadyExists: true
//       });
//     }

//     console.log("🔍 Verifying session with Stripe...");
//     const session = await stripe.checkout.sessions.retrieve(session_id);
//     console.log("💳 Session payment_status:", session.payment_status);
    
//     if (session.payment_status !== "paid") {
//       console.log("❌ Payment not completed");
//       return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
//     }

//     // Get metadata from session
//     const shipping = JSON.parse(session.metadata.shipping || "{}");
//     const items = JSON.parse(session.metadata.items || "[]");
//     const discountPercentage = parseFloat(session.metadata.discountPercentage || "0");
//     const referralCode = session.metadata.referralCode || "";
    
//     console.log("📦 Items from metadata:", items);
//     console.log("🎯 Discount percentage from metadata:", discountPercentage);
//     console.log("🎫 Referral code from metadata:", referralCode);

//     const productIds = items.map(i => i.id);
//     const products = await Product.find({ _id: { $in: productIds } });
//     console.log(`🛒 Found ${products.length} products in database`);

//     let subtotal = 0;
//     let discountedSubtotal = 0;
    
//     const orderItems = items.map(item => {
//       const product = products.find(p => p._id.toString() === item.id);
//       const originalPrice = product ? product.price / 100 : 0;
      
//       let finalPrice = originalPrice;
//       if (discountPercentage > 0) {
//         finalPrice = originalPrice * (1 - discountPercentage / 100);
//         finalPrice = Math.round(finalPrice * 100) / 100;
//       }
      
//       subtotal += originalPrice * item.qty;
//       discountedSubtotal += finalPrice * item.qty;
      
//       return {
//         productId: String(product ? product._id : item.id),
//         name: product?.name || "Unknown Product",
//         originalPrice: originalPrice,
//         price: finalPrice,
//         quantity: item.qty,
//         discountApplied: discountPercentage,
//       };
//     });

//     const total = discountedSubtotal;

//     console.log(`💰 Subtotal: $${subtotal.toFixed(2)}`);
//     console.log(`💰 Discounted Subtotal: $${discountedSubtotal.toFixed(2)}`);
//     console.log(`💰 Total: $${total.toFixed(2)}`);

//     // 💾 Create the order with try-catch for duplicate key
//     let order;
//     try {
//       console.log("💾 Creating order...");
//       order = await Order.create({
//         items: orderItems,
//         subtotal: subtotal,
//         discount: subtotal - discountedSubtotal,
//         discountPercentage: discountPercentage,
//         referralCode: referralCode || null,
//         total: total,
//         stripeSessionId: session_id,
//         status: "completed",
//         shipping: {
//           firstName: shipping.firstName || "",
//           lastName: shipping.lastName || "",
//           email: shipping.email || "",
//           phone: shipping.phone || "",
//           address: shipping.address || "",
//           city: shipping.city || "",
//           state: shipping.state || "",
//           zip: shipping.zip || "",
//           country: shipping.country || "United States",
//         },
//       });
//       console.log("✅ Order saved:", order._id);
//     } catch (createError) {
//       // If duplicate key error, fetch the existing order
//       if (createError.code === 11000) {
//         console.log("⚠️ Duplicate key error, fetching existing order...");
//         const existing = await Order.findOne({ stripeSessionId: session_id });
//         if (existing) {
//           console.log("✅ Found existing order:", existing._id);
//           return NextResponse.json({
//             success: true,
//             orderId: existing._id,
//             message: "Order already exists",
//             alreadyExists: true
//           });
//         }
//       }
//       throw createError;
//     }

//     // 📦 DECREMENT QUANTITY for each product
//     console.log("📦 Updating product quantities...");
//     for (const item of items) {
//       const product = await Product.findById(item.id);
//       if (product) {
//         const oldQuantity = product.quantity;
//         const newQuantity = Math.max(0, oldQuantity - item.qty);
        
//         const updatedProduct = await Product.findByIdAndUpdate(
//           item.id,
//           { quantity: newQuantity },
//           { new: true, returnDocument: 'after' }
//         );
        
//         console.log(`📦 ${product.name}: ${oldQuantity} → ${updatedProduct.quantity} (ordered: ${item.qty})`);
//       } else {
//         console.warn(`⚠️ Product not found for ID: ${item.id}`);
//       }
//     }

//     // 🔔 Send admin email
//     try {
//       await sendAdminOrderEmail(order);
//       console.log("📧 Admin email sent successfully");
//     } catch (emailError) {
//       console.error("❌ Admin email failed:", emailError);
//     }

//     return NextResponse.json({
//       success: true,
//       orderId: order._id,
//       message: "Order placed successfully!",
//     });
//   } catch (error) {
//     console.error("❌ Confirm order error:", error);
//     return NextResponse.json(
//       { error: error.message || "Failed to confirm order" },
//       { status: 500 }
//     );
//   }
// }

// // Add a GET method for testing
// export async function GET() {
//   return NextResponse.json({ 
//     message: "Confirm-order API is working!",
//     timestamp: new Date().toISOString()
//   });
// }