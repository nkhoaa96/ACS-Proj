import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BaseApiService } from 'src/app/modules/@core/api-services/base.api-service';
import { FilePushingRequest } from 'src/app/modules/@core/api-services/device/request-models/file-pushing.request';
import { GettingDeviceTaskRequest } from 'src/app/modules/@core/api-services/device/request-models/getting-device-task.request';
import { SettingDeviceTaskRequest } from 'src/app/modules/@core/api-services/device/request-models/setting-device-task.request';
import { TagRequest } from 'src/app/modules/@core/api-services/device/request-models/tag.request';
import { TaskRequest } from 'src/app/modules/@core/api-services/device/request-models/task.request';
import { DeviceSummaryResponse } from 'src/app/modules/@core/api-services/device/response-models/device-summary.response';
import { DeviceTaskResponse } from 'src/app/modules/@core/api-services/device/response-models/device-task.response';
import {
    PaginationResponse,
    PaginationResponseBuilder,
} from 'src/app/modules/@core/api-services/share-models/pagination.response';
import { SortByFieldRequest } from 'src/app/modules/@core/api-services/share-models/sort-by-field.request';

@Injectable({
    providedIn: 'root',
})
export class AlertApiService extends BaseApiService {
    constructor(http: HttpClient) {
        super(http);
    }

    get$(
        page: number,
        take: number,
        filter: string,
        sorts: SortByFieldRequest[] = [],
        projectionFields: string[] = []
    ): Observable<PaginationResponse<any>> {
        const skip = page * take;
        let params = this.gethHttpParamBuilder()
            .append('limit', take)
            .append('skip', skip)
            .append('filter', filter || 'true');

        if (projectionFields && projectionFields.length) {
            projectionFields.forEach(
                (f) => (params = params.append('projection', f))
            );
        }

        if (sorts && sorts.length) {
            const sort = sorts
                .map((s) => `"${s.fieldName}":${s.direction}`)
                .join(',');
            params = params.append('sort', `{${sort}}`);
        }

        return this.http
            .get<any>(`${this.baseUrl}/api/alerts`, {
                params,
                observe: 'response',
            })
            .pipe(
                map((resp) => {
                    const items = resp.body as any[];
                    const total = +(resp.headers.get('X-Total-Count') || 0);
                    return PaginationResponseBuilder({
                        Total: total,
                        Count: items.length,
                        Items: items,
                        Offset: skip,
                        Limit: take,
                    }) as PaginationResponse<any>;
                })
            );
    }
}
