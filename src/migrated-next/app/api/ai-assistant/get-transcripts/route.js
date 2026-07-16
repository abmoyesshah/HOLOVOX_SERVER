export async function POST(req) {
    try {
        await connectDB();
        
        const body = await req.json();
        const { meetingIds } = body;
        
        // Validate
        if (!Array.isArray(meetingIds) || meetingIds.length === 0) {
            return NextResponse.json({
                success: false,
                error: "meetingIds must be a non-empty array"
            }, { status: 400 });
        }
        
        // ✅ Fetch transcripts - FILTER OUT [NO SPEECH DETECTED]
        // ✅ Sort by createdAt to maintain chronological order
        const transcripts = await Transcript.find({
            roomId: { $in: meetingIds },
            text: { $ne: "[NO SPEECH DETECTED]" }
        })
        .sort({ roomId: 1, participantName: 1, createdAt: 1 }) // ✅ Sort by createdAt
        .lean();
        
        console.log(`📝 Found ${transcripts.length} transcripts`);
        
        // Rest of your grouping logic...
        const groupedByMeeting = {};
        
        transcripts.forEach(transcript => {
            const roomId = transcript.roomId;
            const participantName = transcript.participantName || "Unknown";
            const text = transcript.text || "";
            
            // Skip empty texts (additional safety)
            if (!text || text.trim() === "") return;
            
            if (!groupedByMeeting[roomId]) {
                groupedByMeeting[roomId] = {
                    meetingId: roomId,
                    participants: {}
                };
            }
            
            if (!groupedByMeeting[roomId].participants[participantName]) {
                groupedByMeeting[roomId].participants[participantName] = {
                    name: participantName,
                    texts: [],
                    timestamps: [] // ✅ This will store createdAt
                };
            }
            
            groupedByMeeting[roomId].participants[participantName].texts.push(text);
            
            // ✅ Use createdAt instead of timestamp
            if (transcript.createdAt) {
                groupedByMeeting[roomId].participants[participantName].timestamps.push(transcript.createdAt);
            }
        });
        
        // ✅ Format the response with proper timestamps
        const formattedResult = Object.values(groupedByMeeting).map(meeting => {
            const participants = Object.values(meeting.participants).map(participant => ({
                name: participant.name,
                combinedText: participant.texts.join("\n"),
                combinedTextWithNumbers: participant.texts.map((text, index) => 
                    `${index + 1}. ${text}`
                ).join("\n"),
                textCount: participant.texts.length,
                texts: participant.texts,
                timestamps: participant.timestamps // ✅ Now contains actual createdAt timestamps
            }));
            
            return {
                meetingId: meeting.meetingId,
                participants: participants,
                totalParticipants: participants.length,
                totalTexts: participants.reduce((sum, p) => sum + p.textCount, 0)
            };
        });
        
        return NextResponse.json({
            success: true,
            data: formattedResult,
            summary: {
                totalMeetings: formattedResult.length,
                totalParticipants: formattedResult.reduce((sum, m) => sum + m.totalParticipants, 0),
                totalTexts: formattedResult.reduce((sum, m) => sum + m.totalTexts, 0)
            }
        }, { status: 200 });
        
    } catch (error) {
        console.error("Error in transcripts endpoint:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}