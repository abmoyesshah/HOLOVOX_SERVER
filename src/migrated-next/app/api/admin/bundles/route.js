import Bundle from "../../../../app/models/bundle.model.js";
import connectDB from "../../../../lib/db.js";
import { NextResponse } from "../../../../utils/next-response.js";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const bundle = await Bundle.find({ _id: id });
      if (!bundle)
        return NextResponse.json(
          { error: "bundle not found" },
          { status: 404 },
        );
      return NextResponse.json({ bundle });
    } else {
      const bundles = await Bundle.find({});
      return NextResponse.json({ bundles });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();

    // ✅ These variable names MUST match what you sent from frontend
    const {
      _id,
      name,
      description,
      price,
      image,

      products,

      isActive,
      totalQuantity,
    } = body;

    // Validate required fields
    if (!_id || !name || !price || !products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Create bundle in database
    const bundle = await Bundle.create({
      _id,
      name,
      description: description || "",
      price,
      image: image || "",

      products,

      isActive: isActive !== undefined ? isActive : true,
      totalQuantity: totalQuantity || 0,
    });
    console.log("bundle saved: ",bundle);

    return NextResponse.json({
      success: true,
      data: bundle,
    });
  } catch (error) {
    console.error("Error creating bundle:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
