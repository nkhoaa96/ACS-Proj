import { Component, OnDestroy, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import {
    PaginationResponse,
    PaginationResponseBuilder,
} from 'src/app/modules/@core/api-services/share-models/pagination.response';
import { ConfigService } from 'src/app/modules/@core/services/config.service';
import { DeviceSummaryResponse } from 'src/app/modules/@core/api-services/device/response-models/device-summary.response';
import { DeviceApiService } from 'src/app/modules/@core/api-services/device/device.api-service';
import { ActivatedRoute, Router } from '@angular/router';
import { SortByFieldRequest } from 'src/app/modules/@core/api-services/share-models/sort-by-field.request';
import { sortBuilder } from 'src/app/modules/@shared/enums/sort-directions.enum';
import {
    BehaviorSubject,
    Subscription,
    catchError,
    concat,
    debounceTime,
    finalize,
    of,
    tap,
} from 'rxjs';
import { get } from 'lodash';
import { ToastSeverities } from 'src/app/modules/@shared/enums/toast-severities.enum';
import { AngularCsv } from 'angular-csv-ext/dist/Angular-csv';
import {
    decodeTag,
    encodeTag,
} from 'src/app/modules/@shared/utils/string.util';
import { LogApiService } from "../../@core/api-services/log/log.api-service";
import { LogRequest } from "../../@core/api-services/log/request-models/log.request";
import {formatDDMMYYYYHHmmSS, getEndOfDate} from "../../@shared/utils/date.util";
import {DateRange} from "../../@core/api-services/device/request-models/tag.request";

@Component({
    selector: 'app-device-listing',
    templateUrl: './listing.component.html',
    styleUrls: ['./listing.component.scss'],
    providers: [MessageService],
    styles: [
        `
            :host ::ng-deep .p-cell-editing {
                padding-top: 0 !important;
                padding-bottom: 0 !important;
            }
        `,
    ],
})
export class ListingComponent implements OnInit, OnDestroy {
    searchTerm = '';
    paginationData: PaginationResponse<DeviceSummaryResponse> =
        PaginationResponseBuilder({ Items: [] });
    private readonly searchTerm$ = new BehaviorSubject<string>('');
    private readonly selectedRange$ = new BehaviorSubject<DateRange>({
        from: '',
        to: ''
    });
    private rawFilter: string = '';
    subscriptions: Subscription[] = [];
    chartDateRange: Date[] = [];
    constructor(
        private readonly router: Router,
        private readonly route: ActivatedRoute,
        private readonly deviceApiService: DeviceApiService,
        private readonly logApiService: LogApiService,
        private readonly configService: ConfigService,
        private readonly messageService: MessageService,
    ) {}

    ngOnInit(): void {
        this.subscriptions.push(
            this.searchTerm$
                .asObservable()
                .pipe(debounceTime(300))
                .subscribe((val) => {
                    this.fetchData(val);
                }),
            this.selectedRange$
                .asObservable()
                .subscribe((val) => {
                    this.fetchData("", val.from, val.to);
                }),
            this.route.queryParams.subscribe((queryParam) => {
                const filter = queryParam['filter'];
                if (!filter) {
                    return;
                }
                console.log(filter);
                this.rawFilter = filter;
            })
        );
    }

    fetchData(
        search: string = this.searchTerm$.value,
        from: string = this.selectedRange$.value.from,
        to: string = this.selectedRange$.value.to,
        page: number = this.configService.paginationConfig.page,
        take: number = this.configService.paginationConfig.take10,
        sorts: SortByFieldRequest[] = [],
        projectionFields: string[] = []
    ) {
        const lowerCaseSearchTerm = (search || '').trim().toLocaleLowerCase();
        const searchTerm = [
            'DeviceID.SerialNumber',
            'DeviceID.ProductClass',
            'VirtualParameters.SoftwareVersion',
            'VirtualParameters.IPV4Address',
            'VirtualParameters.OUI',
            'VirtualParameters.SSID24G',
            'VirtualParameters.SSID5G',
            'VirtualParameters.PPPoEACName',
        ]
            .map((c) => `LOWER(${c}) LIKE "%${lowerCaseSearchTerm}%"`)
            .join(' OR ');
        let filter = lowerCaseSearchTerm
            ? `Tags.${encodeTag(
                  (search || '').trim()
              )} IS NOT NULL OR ${searchTerm}`
            : this.rawFilter;
        if (from != "" && to != "") {
            filter = lowerCaseSearchTerm
                ? `Events.Registered > ${from} AND Events.Registered < ${to} OR ${filter}`
                : `Events.Registered > ${from} AND Events.Registered < ${to}`
        }

        this.deviceApiService
            .get$(page, take, filter, sorts, projectionFields)
            .subscribe((data) => {
                this.paginationData = data;
                this.paginationData.Items.forEach((i) => {
                    this.extractTags(i);
                });
            });
    }

    onSearchTermChanged($event: any) {
        console.log('onSearchTermEnter', $event);
        this.searchTerm$.next($event.target.value);
    }

    onRowEdit(item: DeviceSummaryResponse) {
        this.router.navigate([`/devices/${item['DeviceID.ID'].value[0]}`]);
    }

    onRawDetailClicked(item: DeviceSummaryResponse) {
        this.router.navigate([`/devices/${item['DeviceID.ID'].value[0]}/raw`]);
    }

    nextPage(event: any) {
        console.log('nextPage', event);
        const sorts = sortBuilder(event.multiSortMeta);
        const page = event.first / event.rows;
        this.fetchData(this.searchTerm$.value, this.selectedRange$.value.from,this.selectedRange$.value.to, page, event.rows, sorts);
    }

    getStatusColor(item: DeviceSummaryResponse) {
        const lastInform = item['Events.Inform']?.value[0] || 0;
        const delta = Date.now() - lastInform;
        return (delta < 720000 && '#22c55e') || '#ff0000';
    }

    chartDateRangeChanged() {
        const [from, to] = this.chartDateRange;
        if ( !from || !to) {
            return;
        }
        let fromString =  from.getTime().toString()
        let toString =  to.setHours(23,59, 59).toString()
        this.selectedRange$.next(
            {
                from: fromString,
                to: toString
            }
        )
    }

    onExportBtnClicked() {
        const totalCount = this.paginationData.Total;
        const batchSize = 100;
        const batchCount = Math.ceil(totalCount / batchSize);
        const batchSizes = Array.from(
            { length: batchCount },
            (_, i) => batchSize
        );

        console.log(this.route.snapshot)
        const filter = this.route.snapshot.queryParams['filter'];
        console.log(filter)

        const devices: any[] = [];
        concat(
            ...batchSizes.map((pageSize, pageIndex) => {
                return this.deviceApiService.get$(pageIndex, pageSize, filter);
            })
        )
            .pipe(
                tap((result) => {
                    devices.push(
                        ...result.Items.map((d: any) => ({
                            SerialNumber: this.getValue(
                                d['DeviceID.SerialNumber'],
                                'value[0]',
                                ''
                            ),
                            ProductClass: this.getValue(
                                d['DeviceID.ProductClass'],
                                'value[0]',
                                ''
                            ),
                            SoftwareVersion: this.getValue(
                                d['VirtualParameters.SoftwareVersion'],
                                'value[0]',
                                ''
                            ),
                            IPV4Address: this.getValue(
                                d['VirtualParameters.IPV4Address'],
                                'value[0]',
                                ''
                            ),
                            OUI: this.getValue(
                                d['VirtualParameters.OUI'],
                                'value[0]',
                                ''
                            ),
                            // SSID24G: this.getValue(
                            //     d['VirtualParameters.SSID24G'],
                            //     'value[0]',
                            //     ''
                            // ),
                            // SSID5G: this.getValue(
                            //     d['VirtualParameters.SSID5G'],
                            //     'value[0]',
                            //     ''
                            // ),
                            PPPoEACName: this.getValue(
                                d['VirtualParameters.PPPoEACName'],
                                'value[0]',
                                ''
                            ),
                            Inform: new Date(this.getValue(
                                d['Events.Inform'],
                                'value[0]',
                                ''
                            )).toLocaleString(),
                            TagValues: decodeTag(
                                this.getValue(
                                    d['TagValues'],
                                    'value[0]',
                                    ''
                                ).replace(/,/g, ';')
                            ),
                        }))
                    );
                }),
                catchError((e) => {
                    this.messageService.add({
                        severity: ToastSeverities.Error,
                        summary: `Export Failed!`,
                    });
                    return of();
                }),
                finalize(() => {
                    console.log(devices);
                    const options = {
                        headers: [
                            'SerialNumber',
                            'ProductClass',
                            'SoftwareVersion',
                            'IPV4Address',
                            'OUI',
                            // 'SSID24G',
                            // 'SSID5G',
                            'PPPoEACName',
                            'Inform',
                            'Tags',
                        ],
                    };
                    setTimeout(() => {
                        new AngularCsv(
                            devices,
                            'devices-' + Date.now(),
                            options
                        );
                    }, 500);
                    this.messageService.add({
                        severity: ToastSeverities.Success,
                        summary: `Export successfully!`,
                    });
                })
            )
            .subscribe();
        // const logReq = {
        //     action: "Export Devices",
        //     type: "read",
        // } as LogRequest;
        // this.logApiService
        //     .createLog$(logReq)
        //     .subscribe((data) => {
        //         console.log(data)
        //     });
    }

    getValue = get;

    private extractTags(device: DeviceSummaryResponse) {
        const tagValues = device.TagValues?.value[0] || '';
        device.TagPlainValues = tagValues.length
            ? tagValues.split(',').map((t) => decodeTag(t))
            : [];
    }
    ngOnDestroy(): void {
        this.subscriptions.forEach((s) => s.unsubscribe());
    }
}
