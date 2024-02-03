import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from 'src/app/modules/@shared/shared.module';
import { RouterModule } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
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
import { TabMenuModule } from "primeng/tabmenu";
import { DeviceLogComponent } from "./device/device.component";
import { SystemLogComponent } from "./system/system.component";

@NgModule({
    declarations: [
        DeviceLogComponent,
        SystemLogComponent,
    ],
    providers: [ConfirmationService],
    imports: [
        CommonModule,
        RouterModule.forChild([
            {
                path: 'device',
                component: DeviceLogComponent,
            },
            {
                path: 'system',
                component: SystemLogComponent,
            }
        ]),
        ButtonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ToastModule,
        TableModule,
        DialogModule,
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
        TabMenuModule,
    ],
})
export class LogModule {}
