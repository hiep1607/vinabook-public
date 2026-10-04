// This file is required by karma.conf.js and loads recursively all the .spec and framework files

import 'zone.js/testing';
import { CommonModule } from '@angular/common';
import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { getTestBed, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

@Component({ template: '' })
class TestRouteComponent {}

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

// Generated smoke specs in this legacy Angular workspace declare only the
// component under test. Supply the common test infrastructure consistently so
// each spec can focus on behavior instead of repeating injector boilerplate.
const configureTestingModule = TestBed.configureTestingModule.bind(TestBed);
(TestBed as any).configureTestingModule = (metadata: any = {}) => configureTestingModule({
  ...metadata,
  declarations: [TestRouteComponent, ...(metadata.declarations || [])],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientTestingModule,
    RouterTestingModule.withRoutes([
      { path: '**', component: TestRouteComponent }
    ]),
    NoopAnimationsModule,
    ...(metadata.imports || [])
  ],
  schemas: [NO_ERRORS_SCHEMA, ...(metadata.schemas || [])]
});
// Then we find all the tests.
const context = require.context('./', true, /\.spec\.ts$/);
// And load the modules.
context.keys().map(context);
