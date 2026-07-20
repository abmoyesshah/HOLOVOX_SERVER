// app/models/Bundle.model.js
import mongoose from "mongoose";

const BundleProductSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      ref: "Product",
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    // Snapshot of product details at bundle creation time
    productSnapshot: {
      _id: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number, required: true },
      line: { type: String, default: "" },
      category: { type: String, default: "" },
      type: { type: String, enum: ["glasses", "accessory", "ring"], default: "glasses" },
      img: { type: String, default: "" },
      variants: {
        type: [
          {
            color: { type: String, required: true },
            images: { type: [String], default: [] },
            mainImage: { type: String, required: true },
            quantity: { type: Number, default: 0 },
            sizes: {
              type: [
                {
                  size: { type: String, required: true },
                  quantity: { type: Number, default: 0 },
                },
              ],
              default: [],
            },
          },
        ],
        default: [],
      },
    },
  },
  { _id: true },
);

const BundleSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    image: {
      type: String,
      default: "",
    },
    products: {
      type: [BundleProductSchema],
      default: [],
      validate: {
        validator: function (products) {
          return products.length > 0;
        },
        message: "Bundle must contain at least one product",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Total quantity across all products (for inventory management)
    totalQuantity: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Indexes for faster queries
BundleSchema.index({ name: 1 });
BundleSchema.index({ isActive: 1 });
BundleSchema.index({ category: 1 });
BundleSchema.index({ price: 1 });

// Pre-save middleware to calculate total quantity
BundleSchema.pre("save", function (next) {
  let total = 0;
  this.products.forEach((product) => {
    if (product.productSnapshot && product.productSnapshot.variants) {
      product.productSnapshot.variants.forEach((variant) => {
        if (variant.sizes && variant.sizes.length > 0) {
          // For rings: sum quantities from sizes
          total += variant.sizes.reduce((sum, size) => sum + (size.quantity || 0), 0);
        } else {
          // For glasses/accessories: direct quantity
          total += variant.quantity || 0;
        }
      });
    }
  });
  this.totalQuantity = total;
  
});




const Bundle = mongoose.models.Bundle || mongoose.model("Bundle", BundleSchema);

export default Bundle;