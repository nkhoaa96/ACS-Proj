import { Component, OnInit } from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import { FileApiService } from 'src/app/modules/@core/api-services/file/file.api-service';
import { FileResponse } from 'src/app/modules/@core/api-services/file/response-models/file.response';
import { ConfigService } from 'src/app/modules/@core/services/config.service';
import {clone} from "lodash";
import {UpsertUserDto} from "../../@core/api-services/user/user-create.dto";

@Component({
    selector: 'app-file-pushing-popup',
    templateUrl: './detail-history-popup.component.html',
    styleUrls: ['./detail-history-popup.component.scss'],
})
export class DetailHistoryPopupComponent implements OnInit {

    statusList: any = [];

    constructor(
        private readonly config: DynamicDialogConfig
    ) {
        let temp = clone(this.config.data);
        console.log(temp)
        for (let i = temp.length - 1; i >= 0; i--) {
            this.statusList.push(temp[i]);
        }
        console.log(this.statusList)
    }
    ngOnInit(): void {
        console.log("Run")
    }


    protected readonly status = status;
}
