import { DeviceSummaryResponse } from "../../device/response-models/device-summary.response";

export interface LogResponse {
    _id: string;
    id: string;
    checked: boolean;
    action: string;
    device: DeviceSummaryResponse;
    type?: string;
    kind?: string;
    account?: string;
    ppoeUsername?: string;
    resource?: string;
    timestamp?: any;
}
