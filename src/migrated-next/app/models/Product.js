import mongoose from "mongoose";

const SizeVariantSchema = new mongoose.Schema({
  size: { 
    type: String, 
    required: true,
    trim: true,
  },
  quantity: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
}, { _id: true });

const ColorVariantSchema = new mongoose.Schema({
  color: { 
    type: String, 
    required: true,
    trim: true,
  },
  images: { 
    type: [String], 
    default: [] 
  },
  mainImage: { 
    type: String, 
    required: true,
    validate: {
      validator: function(value) {
        return this.images.includes(value);
      },
      message: 'mainImage must be one of the images in the images array'
    }
  },
  // For glasses/accessories: direct quantity
  quantity: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  // For rings: size variants
  sizes: {
    type: [SizeVariantSchema],
    default: [],
  },
}, { _id: true });

const ProductSchema = new mongoose.Schema({
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
  line: {
    type: String,
    default: '',
    trim: true,
  },
  price: { 
    type: Number, 
    required: true,
    min: 0,
  },
  category: {
    type: String,
    default: '',
    trim: true,
  },
  type: { 
    type: String, 
    enum: ["glasses", "accessory", "ring"],
    default: "glasses",
  },
  description: {
    type: String,
    default: '',
  },
  features: {
    type: [String],
    default: [],
  },
  variants: {
    type: [ColorVariantSchema],
    default: [],
    validate: {
      validator: function(variants) {
        const colors = variants.map(v => v.color.toLowerCase());
        return colors.length === new Set(colors).size;
      },
      message: 'Variants must have unique colors'
    }
  },
  // Deprecated fields - kept for backward compatibility
  color: {
    type: String,
    default: '',
  },
  img: {
    type: String,
    default: '',
  },
  gallery: {
    type: [String],
    default: [],
  },
}, { timestamps: true });

// Pre-save middleware to handle legacy fields
ProductSchema.pre('save', function() {
  if (this.variants && this.variants.length > 0) {
    const isValid = this.variants.every(v => 
      v.color && v.mainImage && v.images && v.images.length > 0
    );
    
    if (isValid) {
      const firstVariant = this.variants[0];
      this.color = firstVariant.color;
      this.img = firstVariant.mainImage;
      
      // Calculate total quantity from all variants
      let totalQuantity = 0;
      this.variants.forEach(v => {
        if (v.sizes && v.sizes.length > 0) {
          // For rings: sum quantities from sizes
          totalQuantity += v.sizes.reduce((sum, s) => sum + (s.quantity || 0), 0);
        } else {
          // For glasses/accessories: direct quantity
          totalQuantity += v.quantity || 0;
        }
      });
      this.quantity = totalQuantity;
      
      this.gallery = this.variants.flatMap(v => v.images);
    }
  }
});

// Add indexes for better performance
ProductSchema.index({ _id: 1 });
ProductSchema.index({ name: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ type: 1 });

const Product = mongoose.models.Product || mongoose.model("Product", ProductSchema);
export default Product;