/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

import * as dagreD3 from "dagre-d3";
import * as d3 from "d3";
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;

// Object created when an event occurs (row in data set)
export interface ActivityEvent {
    caseId: number;
    from: string;
    to: string;
}

// Object per case with full path
export interface Case {
    caseId: number;
    pathSorted: string;
}

export class Visual implements IVisual {
    private svg: Selection<SVGElement>;
    private activityEvents: Array<ActivityEvent> = new Array();
    private cases: Array<Case> = new Array();
    private sortedCaseIdsPerPath: Array<any> = new Array();

    constructor(options: VisualConstructorOptions) {
        this.svg = d3.select(options.element).append('svg');
    }

    public update(options: VisualUpdateOptions) {
        // Empty arrays
        this.activityEvents = [];
        this.cases = [];
        this.sortedCaseIdsPerPath = [];

        // Collect data from PowerBI
        let table = options.dataViews[0].table;

        // Fill ActivityEvents
        this.fillActivityEvents(table)

        // Sort ActivityEvents
        this.sortActivityEvents();

        // Plot graph
        this.plotActivities(table, options);
    }

    public fillActivityEvents(table: powerbi.DataViewTable) {
        table.rows.forEach(row => {
            this.activityEvents.push({
                caseId: +row[0],
                from: row[1].toString(),
                to: row[2].toString()
            });
        });
    }

    public sortActivityEvents() {
        // Group all activitiy events with the same caseId
        let activityEventsGroupedByCaseId = this.groupBy(this.activityEvents, 'caseId');

        // Make cases so we can count them later
        for (const caseObjKey in activityEventsGroupedByCaseId) {
            let caseObj = activityEventsGroupedByCaseId[caseObjKey]
            let pathSortedArray = [];
            let pathSortedString = "";

            caseObj.forEach(f => {
                pathSortedArray.push(f.from + "#sep1#" + f.to);
            });

            pathSortedString = pathSortedArray.sort().reduce((accumulator, path) => {
                return accumulator + path + "#sep2#"
            }, '');

            this.cases.push({
                caseId: caseObj[0].caseId,
                pathSorted: pathSortedString
            });
        }

        // Per distinct path we have all the caseIds which have the same path
        let casesGroupedByPath = this.groupBy(this.cases, 'pathSorted');

        // Make an 2d array with all caseIds
        let caseIdArray = []
        for (const caseObjKey in casesGroupedByPath) {
            let caseObj = casesGroupedByPath[caseObjKey]
            let tempArray = []
            caseObj.forEach(c => {
                tempArray.push(c.caseId)
            });
            caseIdArray.push(tempArray);
        }

        caseIdArray.sort(function (a, b) {
            return b.length - a.length;
        });

        this.sortedCaseIdsPerPath = caseIdArray;
    }

    public plotActivities(table: powerbi.DataViewTable, options: VisualUpdateOptions) {
        let showAmountOfFlows = 1;
        let caseIdsToShow = [];

        for (let i = 0; i < showAmountOfFlows; i++) {
            caseIdsToShow.push(this.sortedCaseIdsPerPath[i]);
        }
        caseIdsToShow = caseIdsToShow.reduce((acc, val) => acc.concat(val), []);

        let allActivites = [];
        table.rows.forEach(row => {
            // if (caseIdsToShow.indexOf(+row[0]) != -1) {
            allActivites.push(row[1].toString())
            allActivites.push(row[2].toString())
            // }
        });
        allActivites = [...new Set(allActivites)];

        // Create input graph
        var g = new dagreD3.graphlib.Graph()
            .setGraph({})
            .setDefaultEdgeLabel(function () { return {}; });

        for (let i = 0; i < allActivites.length; i++) {
            g.setNode(allActivites[i], { label: allActivites[i] });
        }

        table.rows.forEach(row => {
            // if (caseIdsToShow.indexOf(+row[0]) != -1)
            g.setEdge(row[1].toString(), row[2].toString());
        });

        // Create the renderer
        var render = new dagreD3.render();

        // Set up an SVG group so that we can translate the final graph
        var svg = d3.select("svg"),
            inner = svg.append("g");

        // Set up zoom support
        let width: number = options.viewport.width;
        let height: number = options.viewport.height;
        this.svg.attr("width", width);
        this.svg.attr("height", height);

        var zoom = d3.zoom().on("zoom", function () {
            inner.attr("transform", d3.event.transform);
        });
        svg.call(zoom);

        // Draws final graph
        render(d3.select("svg g"), g);
    }

    private groupBy(arr, property) {
        return arr.reduce(function (memo, x) {
            if (!memo[x[property]]) { memo[x[property]] = []; }
            memo[x[property]].push(x);
            return memo;
        }, {});
    }
}