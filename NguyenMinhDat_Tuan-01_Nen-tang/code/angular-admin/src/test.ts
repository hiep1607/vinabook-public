// This file is required by karma.conf.js and loads recursively all the .spec and framework files

import 'zone.js/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { getTestBed, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { MatTableExporterModule } from 'mat-table-exporter';
import { OrderModule } from 'ngx-order-pipe';
import { ToastrModule } from 'ngx-toastr';

declare const require: {
  context(path: string, deep?: boolean, filter?: RegExp): {
    keys(): string[];
    <T>(id: string): T;
  };
};

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);

// Legacy admin specs are mostly isolated smoke tests. Provide their common
// infrastructure once so each spec does not accidentally call a real API or
// fail only because a nested template dependency was not declared.
beforeEach(() => {
  TestBed.configureTestingModule({
    imports: [
      FormsModule,
      ReactiveFormsModule,
      HttpClientTestingModule,
      RouterTestingModule,
      NoopAnimationsModule,
      MatTableExporterModule,
      OrderModule,
      ToastrModule.forRoot()
    ],
    schemas: [NO_ERRORS_SCHEMA]
  });
});
// Then we find all the tests.
const context = require.context('./', true, /\.spec\.ts$/);
// And load the modules.
context.keys().map(context);
