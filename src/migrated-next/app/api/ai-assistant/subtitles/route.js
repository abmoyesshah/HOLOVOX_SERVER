import { NextResponse } from "../../../../utils/next-response.js";
import { createClient } from "@deepgram/sdk";

export const runtime = "nodejs";

export async function POST(req) {
    try {
        const formData = await req.formData();
        const audio = formData.get("audio");
        const participantName = formData.get("participantName");

        if (!audio) {
            return NextResponse.json({ error: "No audio file" }, { status: 400 });
        }

        const buffer = Buffer.from(await audio.arrayBuffer());
        if (buffer.length < 1000) {
            return NextResponse.json({ success: true, text: "", speaker: participantName });
        }

        const deepgram = createClient(process.env.DEEPGRAM_API);

        const { result } = await deepgram.listen.prerecorded.transcribeFile(buffer, {
            model: "nova-2",
            smart_format: false,      // skip formatting for speed
            language: "en",
            punctuate: true,
            utterances: false,
        });

        const text =
            result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

        return NextResponse.json({
            success: true,
            text,
            speaker: participantName,
        });
    } catch (err) {
        console.error("SUBTITLE ERROR:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}