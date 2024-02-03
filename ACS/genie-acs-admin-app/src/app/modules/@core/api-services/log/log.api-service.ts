import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BaseApiService } from 'src/app/modules/@core/api-services/base.api-service';
import {
    PaginationResponse,
    PaginationResponseBuilder,
} from 'src/app/modules/@core/api-services/share-models/pagination.response';
import {LogResponse} from "./response-models/log.response";
import {SortByFieldRequest} from "../share-models/sort-by-field.request";
import { BaseConfigRequest } from "../config/request-models/config.request";
import { LogRequest } from "./request-models/log.request";

@Injectable({
    providedIn: 'root',
})
export class LogApiService extends BaseApiService {
    constructor(http: HttpClient) {
        super(http);
    }

    get$(
        page: number = 1,
        take: number = 10,
        filter: string,
        sorts: SortByFieldRequest[] = [],
    ): Observable<PaginationResponse<LogResponse>> {
        const skip = page * take;
        let params = this.gethHttpParamBuilder()
            .append('limit', take)
            .append('skip', skip)
            .append('filter', filter || 'true');
            // .append(
            //     'filter',
            //     `Created = "${deviceId};;;${from.getTime()};;;${to.getTime()}"`
            // );

        if (sorts && sorts.length) {
            const sort = sorts
                .map((s) => `"${s.fieldName}":${s.direction}`)
                .join(',');
            params = params.append('sort', `{${sort}}`);
        }

        return this.http
            .get<LogResponse[]>(`${this.baseUrl}/api/logs`, {
                params,
                observe: 'response',
            })
            .pipe(
                map((resp) => {
                    const items = resp.body as LogResponse[];
                    const total = +(
                        resp.headers.get('X-Total-Count') || items.length
                    );
                    return PaginationResponseBuilder({
                        Total: total,
                        Count: items.length,
                        Items: items,
                        Offset: skip,
                        Limit: take,
                    }) as PaginationResponse<LogResponse>;
                })
            );
    }
    createLog$(log: LogRequest): Observable<any> {
        return this.http.post<any>(
            `${this.baseUrl}/api/logs`,
                log
        );
    }
    delete$(id: string): Observable<any> {
        return this.http.delete<any>(`${this.baseUrl}/api/logs/${id}`);
    }
}
