import { NextResponse } from "../../../../utils/next-response.js";
import connectDB from "../../../../lib/db.js";
import Product from "../../../models/Product.js";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (id) {
      const product = await Product.findById(id);
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      return NextResponse.json({ product });
    } else {
      const products = await Product.find({});
      return NextResponse.json({ products });
    }
  } catch (error) {
    console.error("❌ GET products error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      _id, name, line, price, category, type, description, features, 
      variants, img, color, quantity, gallery 
    } = body;

    // Validate required fields
    if (!_id || !name) {
      return NextResponse.json({ error: "Missing required fields: _id and name are required" }, { status: 400 });
    }

    // ✅ FIX 1: Validate price
    let parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return NextResponse.json({ 
        error: "Invalid price. Price must be a positive number." 
      }, { status: 400 });
    }

    await connectDB();

    const existing = await Product.findById(_id);
    if (existing) {
      return NextResponse.json({ error: `Product with id "${_id}" already exists` }, { status: 409 });
    }

    // ✅ FIX 2: Ensure price is positive and convert to cents
    const priceInCents = Math.round(parsedPrice * 100);

    const productData = {
      _id,
      name,
      line: line || "",
      price: priceInCents,
      category: category || "",
      type: type || "glasses",
      description: description || "",
      features: features || [],
    };

    if (variants && variants.length > 0) {
      productData.variants = variants.map((v) => {
        const variantData = {
          color: v.color,
          images: v.images || [],
          mainImage: v.mainImage || v.images?.[0] || "",
        };

        // If ring type, use sizes
        if (type === 'ring') {
          // Make sure sizes is an array with proper structure
          variantData.sizes = (v.sizes || []).map((s) => ({
            size: s.size || '',
            quantity: s.quantity || 0,
          }));
          variantData.quantity = 0; // Not used directly for rings
        } else {
          variantData.quantity = v.quantity || 0;
          variantData.sizes = [];
        }

        return variantData;
      });

      const firstVariant = productData.variants[0];
      productData.color = firstVariant.color;
      productData.img = firstVariant.mainImage;
      
      // Calculate total quantity
      let totalQuantity = 0;
      productData.variants.forEach((v) => {
        if (v.sizes && v.sizes.length > 0) {
          totalQuantity += v.sizes.reduce((sum, s) => sum + (s.quantity || 0), 0);
        } else {
          totalQuantity += v.quantity || 0;
        }
      });
      productData.quantity = totalQuantity;
      
      productData.gallery = productData.variants.flatMap((v) => v.images);
    } else {
      productData.color = color || "";
      productData.img = img || "";
      productData.quantity = quantity || 0;
      productData.gallery = gallery || [];
      productData.variants = [];
    }

    const product = await Product.create(productData);
    return NextResponse.json({ message: "✅ Product added successfully!", product });
  } catch (error) {
    console.error("❌ Add product error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Product ID is required" }, { status: 400 });

    await connectDB();
    const body = await request.json();
    const { 
      name, line, price, category, type, description, features, 
      variants, img, color, quantity, gallery 
    } = body;

    const product = await Product.findById(id);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    // Update basic fields
    if (name !== undefined) product.name = name;
    if (line !== undefined) product.line = line;
    
    // ✅ FIX 3: Validate price on update
    if (price !== undefined) {
      let parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return NextResponse.json({ 
          error: "Invalid price. Price must be a positive number." 
        }, { status: 400 });
      }
      product.price = Math.round(parsedPrice * 100);
    }
    
    if (category !== undefined) product.category = category;
    if (type !== undefined) product.type = type;
    if (description !== undefined) product.description = description;
    if (features !== undefined) product.features = features;

    // Handle variants
    if (variants && variants.length > 0) {
      product.variants = variants.map(v => {
        const variantData = {
          color: v.color,
          images: v.images || [],
          mainImage: v.mainImage || v.images?.[0] || "",
        };

        // If ring type, use sizes
        if (type === 'ring' || product.type === 'ring') {
          variantData.sizes = v.sizes || [];
          variantData.quantity = 0;
        } else {
          variantData.quantity = v.quantity || 0;
          variantData.sizes = [];
        }

        return variantData;
      });

      // Update legacy fields
      const firstVariant = product.variants[0];
      product.color = firstVariant.color;
      product.img = firstVariant.mainImage;
      
      // Calculate total quantity
      let totalQuantity = 0;
      product.variants.forEach((v) => {
        if (v.sizes && v.sizes.length > 0) {
          totalQuantity += v.sizes.reduce((sum, s) => sum + (s.quantity || 0), 0);
        } else {
          totalQuantity += v.quantity || 0;
        }
      });
      product.quantity = totalQuantity;
      
      product.gallery = product.variants.flatMap(v => v.images);
    } else if (img !== undefined || color !== undefined) {
      // Legacy mode
      if (color !== undefined) product.color = color;
      if (img !== undefined) product.img = img;
      if (quantity !== undefined) product.quantity = quantity;
      if (gallery !== undefined) product.gallery = gallery;
      // Clear variants if they existed
      product.variants = [];
    }

    await product.save();
    return NextResponse.json({ message: "✅ Product updated successfully!", product });
  } catch (error) {
    console.error("❌ Update product error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Product ID is required" }, { status: 400 });

    await connectDB();
    const product = await Product.findByIdAndDelete(id);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json({ message: "✅ Product deleted successfully!" });
  } catch (error) {
    console.error("❌ Delete product error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}






// import { NextResponse } from "../../../../utils/next-response.js";
// import connectDB from "../../../../lib/db.js";
// import Product from "../../../models/Product.js";

// export async function GET(request) {
//   try {
//     await connectDB();
//     const { searchParams } = new URL(request.url);
//     const id = searchParams.get('id');
    
//     if (id) {
//       const product = await Product.findById(id);
//       if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
//       return NextResponse.json({ product });
//     } else {
//       const products = await Product.find({});
//       return NextResponse.json({ products });
//     }
//   } catch (error) {
//     console.error("❌ GET products error:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }

// export async function POST(request) {
//   try {
//     const body = await request.json();
//     const { 
//       _id, name, line, price, category, type, description, features, 
//       variants, img, color, quantity, gallery 
//     } = body;

//     if (!_id || !name || !price) {
//       return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
//     }

//     await connectDB();

//     const existing = await Product.findById(_id);
//     if (existing) {
//       return NextResponse.json({ error: `Product with id "${_id}" already exists` }, { status: 409 });
//     }

//     const priceInCents = Math.round(parseFloat(price) * 100);

//     // Prepare product data
//     const productData = {
//       _id,
//       name,
//       line: line || "",
//       price: priceInCents,
//       category: category || "",
//       type: type || "glasses",
//       description: description || "",
//       features: features || [],
//     };

//     // Use variants if provided, otherwise fall back to legacy fields
//     if (variants && variants.length > 0) {
//       productData.variants = variants.map(v => ({
//         color: v.color,
//         images: v.images || [],
//         mainImage: v.mainImage || v.images?.[0] || "",
//         quantity: v.quantity || 0,
//       }));
//       // Legacy fields for backward compatibility
//       const firstVariant = productData.variants[0];
//       productData.color = firstVariant.color;
//       productData.img = firstVariant.mainImage;
//       productData.quantity = productData.variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
//       productData.gallery = productData.variants.flatMap(v => v.images);
//     } else {
//       // Legacy mode
//       productData.color = color || "";
//       productData.img = img || "";
//       productData.quantity = quantity || 0;
//       productData.gallery = gallery || [];
//     }

//     const product = await Product.create(productData);
//     return NextResponse.json({ message: "✅ Product added successfully!", product });
//   } catch (error) {
//     console.error("❌ Add product error:", error);
//     return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
//   }
// }

// export async function PUT(request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const id = searchParams.get('id');
//     if (!id) return NextResponse.json({ error: "Product ID is required" }, { status: 400 });

//     await connectDB();
//     const body = await request.json();
//     const { 
//       name, line, price, category, type, description, features, 
//       variants, img, color, quantity, gallery 
//     } = body;

//     const product = await Product.findById(id);
//     if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

//     // Update basic fields
//     if (name !== undefined) product.name = name;
//     if (line !== undefined) product.line = line;
//     if (price !== undefined) product.price = Math.round(parseFloat(price) * 100);
//     if (category !== undefined) product.category = category;
//     if (type !== undefined) product.type = type;
//     if (description !== undefined) product.description = description;
//     if (features !== undefined) product.features = features;

//     // Handle variants
//     if (variants && variants.length > 0) {
//       product.variants = variants.map(v => ({
//         color: v.color,
//         images: v.images || [],
//         mainImage: v.mainImage || v.images?.[0] || "",
//         quantity: v.quantity || 0,
//       }));
//       // Update legacy fields
//       const firstVariant = product.variants[0];
//       product.color = firstVariant.color;
//       product.img = firstVariant.mainImage;
//       product.quantity = product.variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
//       product.gallery = product.variants.flatMap(v => v.images);
//     } else if (img !== undefined || color !== undefined) {
//       // Legacy mode
//       if (color !== undefined) product.color = color;
//       if (img !== undefined) product.img = img;
//       if (quantity !== undefined) product.quantity = quantity;
//       if (gallery !== undefined) product.gallery = gallery;
//       // Clear variants if they existed
//       product.variants = [];
//     }

//     await product.save();
//     return NextResponse.json({ message: "✅ Product updated successfully!", product });
//   } catch (error) {
//     console.error("❌ Update product error:", error);
//     return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
//   }
// }

// export async function DELETE(request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const id = searchParams.get('id');
//     if (!id) return NextResponse.json({ error: "Product ID is required" }, { status: 400 });

//     await connectDB();
//     const product = await Product.findByIdAndDelete(id);
//     if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
//     return NextResponse.json({ message: "✅ Product deleted successfully!" });
//   } catch (error) {
//     console.error("❌ Delete product error:", error);
//     return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
//   }
// }