import { Component, OnDestroy, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import {
    PaginationResponse,
    PaginationResponseBuilder,
} from 'src/app/modules/@core/api-services/share-models/pagination.response';
import { ConfigService } from 'src/app/modules/@core/services/config.service';
import { DeviceSummaryResponse } from 'src/app/modules/@core/api-services/device/response-models/device-summary.response';
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
import { AdminConfigResponse } from "../../@core/api-services/config/response-models/admin-config.response";
import {AlertApiService} from "../../@core/api-services/alert/alert.api-service";
import {DetailHistoryPopupComponent} from "../detail-history/detail-history-popup.component";
import moment from "moment";
interface Type {
    name: string;
    code: string;
}
@Component({
    selector: 'app-device-listing',
    templateUrl: './history-listing.component.html',
    styleUrls: ['./history-listing.component.scss'],
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

export class HistoryListingComponent implements OnInit, OnDestroy {
    searchTerm = '';
    paginationData: PaginationResponse<DeviceSummaryResponse> =
        PaginationResponseBuilder({ Items: [] });
    private readonly searchTerm$ = new BehaviorSubject<string>('');
    private readonly typeFilter$ = new BehaviorSubject<string>('All');
    private rawFilter: string = '';
    subscriptions: Subscription[] = [];
    adminConfig!: AdminConfigResponse;
    types: Type[] = []
    selectedType: string = 'All';
    filter: any = {}

    constructor(
        private readonly router: Router,
        private readonly route: ActivatedRoute,
        private readonly alertApiService: AlertApiService,
        private readonly configService: ConfigService,
        private readonly messageService: MessageService,
        private readonly dialogService: DialogService,
    ) {}

    ngOnInit(): void {
        this.types =  [
            {
                name: 'All',
                code: 'All',
            },
            {
                name: 'Connection',
                code: 'Connection',
            },
            {
                name: 'Service Quality',
                code: 'Service Quality',
            },
        ];
        this.subscriptions.push(
            this.searchTerm$
                .asObservable()
                .pipe(debounceTime(300))
                .subscribe((val) => {
                    this.fetchAdminConfig();
                    this.fetchData(val, this.typeFilter$.value);
                }),
            this.typeFilter$
                .asObservable()
                .pipe(debounceTime(300))
                .subscribe((val) => {
                    this.fetchAdminConfig();
                    this.fetchData(this.searchTerm$.value, val);
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
        search: string = '',
        type: string = '',
        page: number = this.configService.paginationConfig.page,
        take: number = this.configService.paginationConfig.take10,
        // sorts: SortByFieldRequest[] = [{
        //     fieldName: "Events.Inform",
        //     direction: 2
        // }],
        sorts: SortByFieldRequest[] = [],
        projectionFields: string[] = []
    ) {
        const lowerCaseSearchTerm = (search || '').trim().toLocaleLowerCase();
        let tempType = `connectionStatus LIKE "%resolved%" AND rxThroughputStatus LIKE "%resolved%" AND txThroughputStatus LIKE "%resolved%"`
        if (type === 'All') {
            tempType = `connectionStatus LIKE "%resolved%" AND rxThroughputStatus LIKE "%resolved%" AND txThroughputStatus LIKE "%resolved%"`
        } else if (type === 'Service Quality') {
            tempType = `rxThroughputStatus LIKE "%resolved%" AND txThroughputStatus LIKE "%resolved%"`
        } else if (type === 'Connection') {
            tempType = `connectionStatus LIKE "%resolved%"`
        }
        let filter = tempType
            ? `${tempType}`
            : this.rawFilter
        console.log(lowerCaseSearchTerm)
        filter = lowerCaseSearchTerm ? `pppoeUser LIKE "%${lowerCaseSearchTerm}%"` : filter
        this.filter = {
            page,
            take,
            filter,
        }

        this.alertApiService
            .get$(page, take, filter, sorts, projectionFields)
            .subscribe((data) => {
                this.paginationData = data;
            });
    }


    onShowHistoryLog(item: any) {
        const ref = this.dialogService.open(DetailHistoryPopupComponent, {
            header: 'History',
            width: '70%',
            closable: true,
            data: item.history
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

    selectTypeFunc(event: any) {
        console.log(event.value.name)
        this.typeFilter$.next(event.value.name)
    }

    nextPage(event: any) {
        console.log('nextPage', event);
        const sorts = sortBuilder(event.multiSortMeta);
        const page = event.first / event.rows;
        this.fetchData(this.searchTerm$.value, this.typeFilter$.value, page, event.rows, sorts);
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
        // console.log(this.route.snapshot)
        const filter = this.filter;

        const alerts: any[] = [];
        concat(
            ...batchSizes.map((pageSize, pageIndex) => {
                return this.alertApiService.get$(filter.page, filter.take, filter.filter);
            })
        )
            .pipe(
                tap((result) => {
                    alerts.push(
                        ...result.Items.map((d: any) => ({
                            SerialNumber: d.serialNumber,
                            ProductClass: d.productClass,
                            Type: this.calculateStatus(d.history),
                            Description: this.generateDescription(d.history),
                            PPPOEUser: d.pppoeUser,
                            Inform: moment(new Date(d.lastInform)).format('YYYY-MM-DD HH:mm:ss'),
                            Logs: JSON.stringify(d.history),
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
                    console.log(alerts);
                    const options = {
                        headers: [
                            'SerialNumber',
                            'ProductClass',
                            'Type',
                            'Description',
                            'PPPOEUser',
                            'Last Inform',
                            'Logs',
                        ],
                    };
                    setTimeout(() => {
                        new AngularCsv(
                            alerts,
                            'history-alert-' + Date.now(),
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

    public calculateStatus(history: any): string {
        let status = "";
        history.forEach((item: any) => {
            if (item.status.includes("connection")) {
                if (!status.includes("Connection")) {
                    status =`Connection`
                }
            }
            if (item.status.includes("rx")) {
                if (!status.includes("Service")) {
                    status =`${status}, Service Quality`
                }
            }
            if (item.status.includes("tx")) {
                if (!status.includes("Service")) {
                    status =`${status}, Service Quality`
                }
            }
        })
        return status;
    }
    public generateDescription(history: any): string {
        let description = "";
        history.forEach((item: any) => {
            if (item.status.includes("connection")) {
                if (!description.includes("Connection Down")) {
                    description =`Connection Down`
                }
            }
            if (item.status.includes("rx")) {
                if (!description.includes("Rx")) {
                    description =`${description}, Rx Throughput Over Limit`
                }
            }
            if (item.status.includes("tx")) {
                if (!description.includes("Tx")) {
                    if (!description.includes("Tx")) {
                        description =`${description}, Tx Throughput Over Limit`
                    }
                }
            }
        })
        return description;
    }

    private fetchAdminConfig() {
        this.configService.adminConfig$.subscribe(
            (config: AdminConfigResponse) => {
                this.adminConfig = config;
            }
        );
    }
    ngOnDestroy(): void {
        this.subscriptions.forEach((s) => s.unsubscribe());
    }

    protected readonly Date = Date;
}
