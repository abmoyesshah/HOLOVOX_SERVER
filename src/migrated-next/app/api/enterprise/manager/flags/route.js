import UserFlag from "../../../../../../models/enterprise/UserFlag.model.js";
import { NextResponse } from "../../../../../utils/next-response.js";


async function GET(req) {
    try {
        const param = new URL(req.URL);
        const managerId = param.searchParams.get("managerId");
        if(!managerId){
             return NextResponse.json({
            error: "manager Id is required"
        }, {status: 400})
        }
        const flags = await UserFlag.find({managerId: managerId});
        return NextResponse.json({
            success:true,
            flags
        }, {status: 200});
    } catch (error) {
        return NextResponse.json({
            error: "internal error" + error.message
        }, {status: 500})
    }
}