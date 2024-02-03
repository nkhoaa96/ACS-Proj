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
import {AlertApiService} from "../../@core/api-services/alert/alert.api-service";
import {DetailHistoryPopupComponent} from "../detail-history/detail-history-popup.component";
import moment from "moment/moment";
interface Type {
    name: string;
    code: string;
}
@Component({
    selector: 'app-device-listing',
    templateUrl: './current-listing.component.html',
    styleUrls: ['./current-listing.component.scss'],
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

export class CurrentListingComponent implements OnInit, OnDestroy {
    searchTerm = '';
    paginationData: PaginationResponse<DeviceSummaryResponse> =
        PaginationResponseBuilder({ Items: [] });
    private readonly searchTerm$ = new BehaviorSubject<string>('');
    private readonly typeFilter$ = new BehaviorSubject<string>('All');
    private rawFilter: string = '';
    subscriptions: Subscription[] = [];
    types: Type[] = []
    selectedType: string = 'All';
    filter: any = {};

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
                    this.fetchData(val,this.typeFilter$.value);
                }),
            this.typeFilter$
                .asObservable()
                .pipe(debounceTime(300))
                .subscribe((val) => {
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
        type: string = 'All',
        page: number = this.configService.paginationConfig.page,
        take: number = this.configService.paginationConfig.take10,
        sorts: SortByFieldRequest[] = [],
        projectionFields: string[] = []
    ) {
        const lowerCaseSearchTerm = (search || '').trim().toLocaleLowerCase();
        let tempType = `connectionStatus LIKE "%firing%" OR rxThroughputStatus LIKE "%firing%" OR txThroughputStatus LIKE "%firing%"`
        if (type === 'All') {
            tempType = `connectionStatus LIKE "%firing%" OR rxThroughputStatus LIKE "%firing%" OR txThroughputStatus LIKE "%firing%"`
        } else if (type === 'Service Quality') {
            tempType = `rxThroughputStatus LIKE "%firing%" OR txThroughputStatus LIKE "%firing%"`
        } else if (type === 'Connection') {
            tempType = `connectionStatus LIKE "%firing%"`
        }
        let filter = tempType
            ? `${tempType}`
            : this.rawFilter;
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

    onSearchTermChanged($event: any) {
        console.log('onSearchTermEnter', $event);
        this.searchTerm$.next($event.target.value);
    }

    onShowHistoryLog(item: any) {
        const ref = this.dialogService.open(DetailHistoryPopupComponent, {
            header: 'History',
            width: '70%',
            closable: true,
            data: item.history
        });
    }


    selectTypeFunc(event: any) {
        this.typeFilter$.next(event.value.code)
    }

    nextPage(event: any) {
        console.log('nextPage', event);
        const sorts = sortBuilder(event.multiSortMeta);
        const page = event.first / event.rows;
        this.fetchData(this.searchTerm$.value, this.typeFilter$.value, page, event.rows, sorts);
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
        console.log(filter)

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
                            Type: this.calculateStatus(d),
                            Description: this.generateDescription(d),
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
                            'current-alert-' + Date.now(),
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

    public calculateStatus(alert: any): string {
        let status = "Connection";
        if (alert.connectionStatus === 'firing') {
            if (alert.rxThroughputStatus === 'firing' || alert.txThroughputStatus === 'firing') {
                status = 'Connection, Service Quality'
            }
        } else {
            status = 'Service Quality'
        }
        return status;
    }
    public generateDescription(alert: any): string {
        let status = "Connection Down";
        if (alert.connectionStatus === 'firing') {
            if (alert.rxThroughputStatus === 'firing') {
                status = `${status}, Rx Throughput Over Limit`
            }
            if (alert.txThroughputStatus === 'firing') {
                status = `${status}, Tx Throughput Over Limit`
            }
        } else {
            if (alert.rxThroughputStatus === 'firing') {
                status = `Rx Throughput Over Limit`
            }
            if (alert.txThroughputStatus === 'firing') {
                status = `${status}, Tx Throughput Over Limit`
            }
        }
        return status;
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach((s) => s.unsubscribe());
    }

    protected readonly Date = Date;
}
