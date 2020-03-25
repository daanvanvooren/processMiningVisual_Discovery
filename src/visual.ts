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

export interface Relationship {
    key: string;
    from: string;
    to: string;
    amount: number;
    isHappyPath: boolean;
    caseIds: Array<number>;
}

export class Visual implements IVisual {
    private svgContainer: Selection<SVGElement>;
    private svg: d3.Selection<d3.BaseType, unknown, HTMLElement, any>
    private zoom: d3.ZoomBehavior<Element, unknown>;

    private relationships: Map<string, Relationship> = new Map();

    constructor(options: VisualConstructorOptions) {
        this.svgContainer = d3.select(options.element).append('svg');

        this.svg = d3.select('svg');
        let inner = this.svg.append('g');

        this.zoom = d3.zoom().on('zoom', function () {
            inner.attr('transform', d3.event.transform);
        });

        this.svg.call(this.zoom);
    }

    public update(options: VisualUpdateOptions) {
        // Empty relationships
        this.relationships.clear();

        // Collect data from PowerBI
        let table = options.dataViews[0].table;

        this.fillRelationships(table)
        this.plotActivities(table, options)
    }

    public fillRelationships(table: powerbi.DataViewTable) {
        let caseId, from, to, ihp;
        let happyPath = [];
        table.rows.forEach(row => {
            caseId = +row[0];
            from = row[1].toString();
            to = row[2].toString()
            ihp = (row[3].toString() === 'true')
            let key = from + "->" + to;
            if (ihp) {
                happyPath.push(key);
            }
            if (!this.relationships.has(key)) {
                this.relationships.set(key, <Relationship>{
                    key: key,
                    from: from,
                    to: to,
                    amount: 1,
                    isHappyPath: false,
                    caseIds: [caseId]
                });
            } else {
                let rel = this.relationships.get(key);
                rel.amount++;
                rel.caseIds.push(caseId);
            }
        });
        happyPath.forEach(key => {
            this.relationships.get(key).isHappyPath = true;
        });
    }

    public makeNode(text: string, subTekst: string) {
        var html = "<div class=node>";
        html += "<div class=main>" + text + "</div>";
        html += "<div class=sub>" + subTekst + "</div>";
        html += "</div>";
        return html;
    }

    public plotActivities(table: powerbi.DataViewTable, options: VisualUpdateOptions) {
        let caseIds = [];
        let allActivites = [];

        table.rows.forEach(row => {
            allActivites.push(row[1].toString());
            allActivites.push(row[2].toString());
            caseIds.push(+row[0]);
        });
        allActivites = [...new Set(allActivites)];
        caseIds = [...new Set(caseIds)];

        // Create input graph
        var g = new dagreD3.graphlib.Graph()
            .setGraph({})
            .setDefaultEdgeLabel(function () { return {}; });

        for (let i = 0; i < allActivites.length; i++) {
            g.setNode(allActivites[i], {
                labelType: "html",
                label: this.makeNode(allActivites[i], "Extra info"),
                rx: 5,
                ry: 5,
                padding: 0
            });
        }

        // Plot graph
        this.relationships.forEach(rel => {
            g.setEdge(rel.from, rel.to, {
                style: rel.isHappyPath ? "stroke: black; stroke-width: 2.5px;" : "stroke: #262626; stroke-dasharray: 7, 5;",
                arrowheadStyle: rel.isHappyPath ? "fill: black;" : "fill: #262626;",
                label: `${Math.round(rel.amount / caseIds.length * 1000) / 10}% (${rel.amount}/${caseIds.length})`,
                labelStyle: "fill: black; color: black;",
                curve: d3.curveBasis
            });
        });

        // Create renderer
        var render = new dagreD3.render();

        // Draw final graph
        render(d3.select("svg g"), g);

        // Change viewport dimensions and  center the graph
        this.svgContainer.attr("width", options.viewport.width);

        var initialScale = 0.75;
        this.svg.call(this.zoom.transform, d3.zoomIdentity.translate((+this.svg.attr("width") - g.graph().width * initialScale) / 2, 20).scale(initialScale));
        this.svg.attr('height', g.graph().height * initialScale + 40);

        this.svgContainer.attr("height", options.viewport.height);
    }
}