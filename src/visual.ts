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
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import * as mermaid from "mermaid";
import { VisualSettings } from "./settings";

// Process Activity
export interface Activity {
    caseId: number;
    activityName: string;
    timestamp: Date;
}

export class Visual implements IVisual {
    // Attributes
    private target: HTMLElement;
    private mermaidDiv: HTMLElement
    private activities: Array<Activity> = new Array();

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
    }

    public update(options: VisualUpdateOptions) {
        // Clear canvas and loaded activities
        this.target.innerHTML = ""; // TODO: think about a more performant way to do this
        this.activities = [];

        // Collect data from PowerBI
        let dataViews = options.dataViews;
        let table = dataViews[0].table

        // Construct graphstring
        this.fillActivities(table);
        let graphString = this.constructGraphString(this.activities);

        // Plot the graph
        this.plotActivities(this.target, graphString);
    }

    // Functions
    public fillActivities(table: powerbi.DataViewTable) {
        table.rows.forEach(row => {
            this.activities.push({
                caseId: +row[1],
                activityName: row[0].toString(),
                timestamp: new Date(row[2].toString())
            });
        });
    }

    private groupBy(arr, property) {
        // Helper function to group all objects with a same property
        return arr.reduce(function (memo, x) {
            if (!memo[x[property]]) { memo[x[property]] = []; }
            memo[x[property]].push(x);
            return memo;
        }, {});
    }

    public constructGraphString(activities: Array<Activity>) {
        // Group all activities with the same caseId
        let activitiesGroupedByCaseId = this.groupBy(activities, 'caseId');

        // Construct a graphString for each case
        let allGraphStrings = [];
        for (const actGroup in activitiesGroupedByCaseId) {
            let actGroupObj = activitiesGroupedByCaseId[actGroup]
            actGroupObj.sort((a, b) => (a.timestamp > b.timestamp) ? 1 : -1)

            let graphString = actGroupObj.reduce((accumulator, act) => {
                return accumulator + act.activityName + '-->'
            }, '');

            graphString = graphString.slice(0, -3)
            allGraphStrings.push(graphString);
        }

        // Remove double links

        // Construct final graphString which includes every case
        let finalGraphString = allGraphStrings.reduce((accumulator, gs) => {
            return accumulator + gs + '\n'
        }, '');

        finalGraphString = finalGraphString.slice(0, -1)
        return finalGraphString;
    }

    public plotActivities(target: HTMLElement, graphString: string) {
        // Make mermaid div
        this.mermaidDiv = document.createElement("div")
        this.mermaidDiv.classList.add("graphDiv");
        target.appendChild(this.mermaidDiv);

        // Run mermaid script
        mermaid.mermaidAPI.initialize({
            startOnLoad: false
        });

        // Ask API to plot our graphString as SVG
        const element: any = this.mermaidDiv;
        const graphDefinition = "graph TB\n" + graphString;
        mermaid.render("graphDiv", graphDefinition, (svgCode, bindFunctions) => {
            element.innerHTML = svgCode;
        });
    }
}