import { BaseConfigResponse } from 'src/app/modules/@core/api-services/config/response-models/config.response';

export interface AdminConfigResponse extends BaseConfigResponse {
    data: {
        dashboardLink: string;
        configClearTime: number;
        downloadRatio: number;
        downloadOptionText01: string;
        downloadOptionLink01: string;
        downloadOptionText02: string;
        downloadOptionLink02: string;
        downloadOptionText03: string;
        downloadOptionLink03: string;
        downloadOptionText04: string;
        downloadOptionLink04: string;
        downloadOptionText05: string;
        downloadOptionLink05: string;
        downloadOptionText06: string;
        downloadOptionLink06: string;
        downloadOptionText07: string;
        downloadOptionLink07: string;
        downloadOptionText08: string;
        downloadOptionLink08: string;
        downloadOptionText09: string;
        downloadOptionLink09: string;
        downloadOptionText10: string;
        downloadOptionLink10: string;
        uploadLink: string;
        uploadRatio: number;
        uploadOptionText01: string;
        uploadOptionSize01: string;
        uploadOptionText02: string;
        uploadOptionSize02: string;
        uploadOptionText03: string;
        uploadOptionSize03: string;
        uploadOptionText04: string;
        uploadOptionSize04: string;
        uploadOptionText05: string;
        uploadOptionSize05: string;
        uploadOptionText06: string;
        uploadOptionSize06: string;
        uploadOptionText07: string;
        uploadOptionSize07: string;
        uploadOptionText08: string;
        uploadOptionSize08: string;
        uploadOptionText09: string;
        uploadOptionSize09: string;
        uploadOptionText10: string;
        uploadOptionSize10: string;
        txThroughputMin: number;
        txThroughputMax: number;
        rxThroughputMin: number;
        rxThroughputMax: number;
    };
}
