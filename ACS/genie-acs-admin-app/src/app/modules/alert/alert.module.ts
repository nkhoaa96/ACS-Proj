import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from 'src/app/modules/@shared/shared.module';
import { RouterModule } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ProgressBarModule } from 'primeng/progressbar';
import { ChipsModule } from 'primeng/chips';
import { TagModule } from 'primeng/tag';
import { ChipModule } from 'primeng/chip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DropdownModule } from 'primeng/dropdown';
import { CheckboxModule } from 'primeng/checkbox';
import { ChartModule } from 'primeng/chart';
import { CalendarModule } from 'primeng/calendar';
import {CurrentListingComponent} from "./current-listing/current-listing.component";
import {HistoryListingComponent} from "./history-listing/history-listing.component";
import {DetailHistoryPopupComponent} from "./detail-history/detail-history-popup.component";
import {TimelineModule} from "primeng/timeline";

@NgModule({
    declarations: [
        HistoryListingComponent,
        CurrentListingComponent,
        DetailHistoryPopupComponent
    ],
    providers: [DialogService, ConfirmationService],
    imports: [
        CommonModule,
        RouterModule.forChild([
            {
                path: 'history',
                component: HistoryListingComponent,
            },
            {
                path: 'current',
                component: CurrentListingComponent,
            }
        ]),
        ButtonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ToastModule,
        TableModule,
        DialogModule,
        DynamicDialogModule,
        SharedModule,
        ProgressSpinnerModule,
        ProgressBarModule,
        ChipsModule,
        ChipModule,
        TagModule,
        ConfirmDialogModule,
        AutoCompleteModule,
        DropdownModule,
        CheckboxModule,
        ChartModule,
        CalendarModule,
        TimelineModule,
    ],
})
export class AlertModule {}
