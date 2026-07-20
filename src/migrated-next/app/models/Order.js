import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  items: [{
    productId: { type: String, required: true },
    name: { type: String, required: true },
    originalPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    discountApplied: { type: Number, default: 0 },
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  referralCode: { type: String, default: null },
  shippingCost: { type: Number, default: 0 }, // ✅ ADD THIS LINE
  total: { type: Number, required: true },
  stripeSessionId: { type: String, unique: true, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'refunded'], 
    default: 'pending' 
  },
  shipping: {
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    country: { type: String, default: "United States" },
  },
}, { timestamps: true });

// Delete existing model to avoid conflicts
if (mongoose.models.Order) {
  delete mongoose.models.Order;
}

const Order = mongoose.model("Order", orderSchema);
export default Order;


// import mongoose from "mongoose";

// const orderSchema = new mongoose.Schema({
//   items: [{
//     productId: { type: String, required: true },
//     name: { type: String, required: true },
//     originalPrice: { type: Number, required: true },
//     price: { type: Number, required: true },
//     quantity: { type: Number, required: true, min: 1 },
//     discountApplied: { type: Number, default: 0 },
//   }],
//   subtotal: { type: Number, required: true },
//   discount: { type: Number, default: 0 },
//   discountPercentage: { type: Number, default: 0 },
//   referralCode: { type: String, default: null },
//   total: { type: Number, required: true },
//   stripeSessionId: { type: String, unique: true, required: true },
//   status: { 
//     type: String, 
//     enum: ['pending', 'completed', 'failed', 'refunded'], 
//     default: 'pending' 
//   },
//   shipping: {
//     firstName: String,
//     lastName: String,
//     email: String,
//     phone: String,
//     address: String,
//     city: String,
//     state: String,
//     zip: String,
//     country: { type: String, default: "United States" },
//   },
// }, { timestamps: true });

// // Delete the existing model to avoid conflicts
// if (mongoose.models.Order) {
//   delete mongoose.models.Order;
// }

// const Order = mongoose.model("Order", orderSchema);
// export default Order;