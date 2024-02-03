
import {Component, OnDestroy, OnInit} from '@angular/core';
import {ConfirmationService, MessageService} from 'primeng/api';
import {DialogService} from 'primeng/dynamicdialog';
import {
    PaginationResponse,
    PaginationResponseBuilder,
} from 'src/app/modules/@core/api-services/share-models/pagination.response';
import {ConfigService} from 'src/app/modules/@core/services/config.service';
import {DeviceSummaryResponse} from 'src/app/modules/@core/api-services/device/response-models/device-summary.response';
import {ActivatedRoute, Router} from '@angular/router';
import {SortByFieldRequest} from 'src/app/modules/@core/api-services/share-models/sort-by-field.request';
import {sortBuilder} from 'src/app/modules/@shared/enums/sort-directions.enum';
import {BehaviorSubject, catchError, concat, debounceTime, finalize, of, Subscription, tap,} from 'rxjs';
import {get} from 'lodash';
import {ToastSeverities} from 'src/app/modules/@shared/enums/toast-severities.enum';
import {decodeTag, encodeTag,} from 'src/app/modules/@shared/utils/string.util';
import {AuthService} from "../../@core/services/auth.service";
import {LogApiService} from "../../@core/api-services/log/log.api-service";
import {LogResponse} from "../../@core/api-services/log/response-models/log.response";
import {AngularCsv} from "angular-csv-ext/dist/Angular-csv";
import { getHourFromDate } from "../../@shared/utils/date.util";
import { DateRange } from "../../@core/api-services/device/request-models/tag.request";

@Component({
    selector: 'app-device-listing',
    templateUrl: './device.component.html',
    styleUrls: ['./device.component.scss'],
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
export class DeviceLogComponent implements OnInit, OnDestroy {
    searchTerm = '';
    username='';
    paginationData: PaginationResponse<LogResponse> =
        PaginationResponseBuilder({ Items: [] });
    private readonly searchTerm$ = new BehaviorSubject<string>('');
    private readonly selectedRange$ = new BehaviorSubject<DateRange>({
        from: '',
        to: ''
    });
    private rawFilter: string = '';
    subscriptions: Subscription[] = [];
    chartDateRange: Date[] = [];
    logIds: string[] = [];
    filter: any = {};
    constructor(
        private readonly router: Router,
        private readonly route: ActivatedRoute,
        private readonly logApiService: LogApiService,
        private readonly configService: ConfigService,
        private readonly messageService: MessageService,
        private readonly confirmationService: ConfirmationService,
    ) {}

    itemsTab: any;

    ngOnInit(): void {
        this.itemsTab = [
            {label: 'Device'},
            {label: 'System'},
        ];
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
    ) {
        const lowerCaseSearchTerm = (search || '').trim().toLocaleLowerCase();
        // let searchTerm: any
        // searchTerm = [
        //     'DeviceID.SerialNumber',
        //     'DeviceID.ProductClass',
        //     'VirtualParameters.SoftwareVersion',
        //     'VirtualParameters.IPV4Address',
        //     'VirtualParameters.OUI',
        //     'VirtualParameters.SSID24G',
        //     'VirtualParameters.SSID5G',
        //     'VirtualParameters.PPPoEACName',
        // ]
        //     .map((c) => `LOWER(${c}) LIKE "%${lowerCaseSearchTerm}%"`)
        //     .join(' OR ');

        let filter = `kind LIKE "%device%"`;
        filter = lowerCaseSearchTerm
            ? `${filter} AND pppoeUser LIKE "%${lowerCaseSearchTerm}%"`
            : `${filter}`
        if (from != "" && to != "") {
            filter = `kind LIKE "%device%" AND timestamp > ${from} AND timestamp < ${to} AND ${filter}`
        }
        this.filter = {
            page,
            take,
            filter,
        }
        this.logApiService
            .get$(page, take, filter, sorts)
            .subscribe((data) => {
                this.paginationData = data;
                console.log(data)
                this.paginationData.Items.forEach((i) => {
                    this.extractTags(i);
                });
            });
    }
    selectAllItems: boolean = false;
    selectAll(isChecked: boolean) {
        this.selectAllItems = isChecked;
        for (const item of this.paginationData.Items) {
            this.logIds.push(item._id)
            item.checked = this.selectAllItems;
        }
        if (!isChecked) this.logIds = []
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
    onItemChange(itemIdx: number, isChecked: boolean) {
        this.paginationData.Items[itemIdx].checked = isChecked;
        this.selectAllItems = this.paginationData.Items.every(item => item.checked);
        if (isChecked) {
            this.logIds.push(this.paginationData.Items[itemIdx]._id)
        } else {
            this.selectAllItems = false;
            this.logIds = this.logIds.filter(item => item !== this.paginationData.Items[itemIdx]._id);
        }
    }
    onSearchTermChanged($event: any) {
        console.log('onSearchTermEnter', $event);
        this.searchTerm$.next($event.target.value);
    }
    onRowEdit(item: DeviceSummaryResponse) {
        this.router.navigate([`/devices/${item['DeviceID.ID'].value[0]}`]);
    }

    nextPage(event: any) {
        console.log('nextPage', event);
        const sorts = sortBuilder(event.multiSortMeta);
        const page = event.first / event.rows;
        this.fetchData(this.searchTerm$.value, this.selectedRange$.value.from, this.selectedRange$.value.to, page, event.rows, sorts);
    }

    getStatusColor(item: DeviceSummaryResponse) {
        const lastInform = item['Events.Inform']?.value[0] || 0;
        const delta = Date.now() - lastInform;
        return (delta < 720000 && '#22c55e') || '#ff0000';
    }

    onExportBtnClicked() {
        const totalCount = this.paginationData.Total;
        const batchSize = 100;
        const batchCount = Math.ceil(totalCount / batchSize);
        const batchSizes = Array.from(
            { length: batchCount },
            (_, i) => batchSize
        );

        const filter = this.filter;

        const devices: any[] = [];
        concat(
            ...batchSizes.map((pageSize, pageIndex) => {
                return this.logApiService.get$(filter.page, filter.take, filter.filter);
            })
        )
            .pipe(
                tap((result) => {
                    devices.push(
                        ...result.Items.map((d: any) => ({
                            SerialNumber: this.getValue(
                                d.device['DeviceID.SerialNumber'],
                                'value[0]',
                                ''
                            ),
                            ProductClass: this.getValue(
                                d.device['DeviceID.ProductClass'],
                                'value[0]',
                                ''
                            ),
                            Description: d.action,
                            Type: d.type,
                            Account: d.account,
                            PPPoEACName: this.getValue(
                                d.device['VirtualParameters.PPPoEACName'],
                                'value[0]',
                                ''
                            ),
                            Inform: new Date(this.getValue(
                                d.device['Events.Inform'],
                                'value[0]',
                                ''
                            )).toLocaleString(),
                            Time: new Date(d.timestamp).toLocaleString(),
                            Tags: decodeTag(
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
                            'Description',
                            'Type',
                            'Account',
                            'PPPoEACName',
                            'Inform',
                            'Time',
                            'Tags',
                        ],
                    };
                    setTimeout(() => {
                        new AngularCsv(
                            devices,
                            'logs-' + Date.now(),
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
    }

    getValue = get;

    private extractTags(log: LogResponse) {
        const tagValues = log.device?.TagValues?.value[0] || '';
        log.device.TagPlainValues = tagValues.length
            ? tagValues.split(',').map((t) => decodeTag(t))
            : [];
        log.checked = false;
        log.timestamp = new Date(log.timestamp).toLocaleString();
    }
    ngOnDestroy(): void {
        this.subscriptions.forEach((s) => s.unsubscribe());
    }

    onRowDelete(item: LogResponse) {
        this.confirmationService.confirm({
            message: 'Do you want to delete log: ' + item._id,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: () => {
                this.logApiService
                    .delete$(item._id)
                    .pipe(
                        tap(() => {
                            this.fetchData();
                            this.messageService.add({
                                severity: ToastSeverities.Success,
                                summary:
                                    'Delete log Successfully!',
                            });
                        }),
                        catchError((e) => {
                            this.messageService.add({
                                severity: ToastSeverities.Error,
                                summary: 'Error!',
                            });
                            return of(undefined);
                        })
                    )
                    .subscribe();
            },
        });
    }
    onRowDeleteAll() {
        this.confirmationService.confirm({
            message: 'Do you want to delete all device log',
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: () => {
                this.logIds.forEach(item => {
                    this.logApiService
                        .delete$(item)
                        .pipe(
                            tap(() => {
                                this.fetchData();
                                this.messageService.add({
                                    severity: ToastSeverities.Success,
                                    summary:
                                        'Delete log Successfully!',
                                });
                            }),
                            catchError((e) => {
                                this.messageService.add({
                                    severity: ToastSeverities.Error,
                                    summary: 'Error!',
                                });
                                return of(undefined);
                            })
                        )
                        .subscribe();
                })
            },
        });
    }
}
