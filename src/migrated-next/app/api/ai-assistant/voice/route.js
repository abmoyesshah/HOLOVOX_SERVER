import { NextResponse } from "../../../../utils/next-response.js";

export async function POST(req) {
  try {
    const { text } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // 👉 make speech slower by adding pauses
    const slowText = text
      .replace(/\./g, "...")
      .replace(/,/g, ", ");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: slowText,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.8,
            similarity_boost: 0.4,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs Error:", errorText);

      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });

  } catch (error) {
    console.error("TTS Route Error:", error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}










// import { NextResponse } from "../../../../utils/next-response.js";

// export async function POST(req) {
//   try {
//     const { text } = await req.json();

//     if (!text || !text.trim()) {
//       return NextResponse.json(
//         { error: "Text is required" },
//         { status: 400 }
//       );
//     }

//     // FREE TIER WORKING VOICE + MODEL
//     const response = await fetch(
//       "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL",
//       {
//         method: "POST",
//         headers: {
//           "xi-api-key": process.env.ELEVENLABS_API_KEY,
//           "Content-Type": "application/json",
//           Accept: "audio/mpeg",
//         },
//         body: JSON.stringify({
//           text,
//           model_id: "eleven_turbo_v2",
//           voice_settings: {
//             stability: 0.5,
//             similarity_boost: 0.75,
//           },
//         }),
//       }
//     );

//     // HANDLE ERRORS
//     if (!response.ok) {
//       const errorText = await response.text();

//       console.error("ElevenLabs Error:", errorText);

//       return NextResponse.json(
//         { error: errorText },
//         { status: response.status }
//       );
//     }

//     // AUDIO BUFFER
//     const audioBuffer = await response.arrayBuffer();

//     // RETURN MP3
//     return new Response(audioBuffer, {
//       status: 200,
//       headers: {
//         "Content-Type": "audio/mpeg",
//       },
//     });
//   } catch (error) {
//     console.error("TTS Route Error:", error);

//     return NextResponse.json(
//       { error: "Internal Server Error" },
//       { status: 500 }
//     );
//   }
// }