import { Injectable, Pipe, PipeTransform } from '@angular/core';
import { DatePipe } from '@angular/common';

@Injectable()
@Pipe({name: 'date', pure: true})
export class StringSafeDatePipe extends DatePipe implements PipeTransform {
 transform(value: any, format: string): string {
   value = typeof value === 'string' ?
           Date.parse(value) : value;
   return super.transform(value, format);
 }
}


/*
Copyright 2016 Google Inc. All Rights Reserved.
Use of this source code is governed by an MIT-style license that
can be found in the LICENSE file at http://angular.io/license
*/