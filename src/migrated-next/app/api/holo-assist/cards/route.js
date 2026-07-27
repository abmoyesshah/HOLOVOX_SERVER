import { NextResponse } from "../../../../utils/next-response.js";
import SuggestionCard from "../../../models/SuggesionCards.model.js";
import connectDB from "../../../../lib/db.js"

export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { userId, cardId, text, type, roomId } = body;
    console.log("userId: ",userId)
    console.log("cardId: ",cardId)
    // console.log("userId: ",userId)
    // Validate required fields
    if (!userId || !cardId) {
      return NextResponse.json(
        {
          success: false,
          error: "userId and cardId are required",
        },
        { status: 400 }
      );
    }

    // Check if card already exists for this user (prevent duplicates)
    const existingCard = await SuggestionCard.findOne({
      userId,
      cardId,
    });

    if (existingCard) {
      return NextResponse.json({
        success: true,
        message: "Card already saved",
        suggestionCard: existingCard,
        isNew: false,
      });
    }

    // Create new suggestion card
    const suggestionCard = await SuggestionCard.create({
      userId,
      cardId,
      roomId,
      text: text || "",
      type: type || "general",
    });

    return NextResponse.json({
      success: true,
      suggestionCard,
      isNew: true,
    });
  } catch (error) {
    console.error("❌ Error saving suggestion card:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal error: " + error.message,
      },
      { status: 500 }
    );
  }
}