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
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

// Settings visual
import { VisualSettings } from "./settings";
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;

// D3
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
  durations: Array<number>;
}

export class Visual implements IVisual {
  private svgContainer: Selection<SVGElement>;
  private svg: d3.Selection<d3.BaseType, unknown, HTMLElement, any>;
  private zoom: d3.ZoomBehavior<Element, unknown>;
  private target: HTMLElement;
  private updateCount: number;

  private textNode: Text;
  private host: IVisualHost;
  private windowsLoaded: number;

  // Settings visual
  private visualSettings: VisualSettings;
  private settings: VisualSettings;
  private relationShipPercentageThreshold: number = 0;

  private relationships: Map<string, Relationship> = new Map();

  constructor(options: VisualConstructorOptions) {
    this.svgContainer = d3.select(options.element).append("svg");

    this.svg = d3.select("svg");
    let inner = this.svg.append("g");

    this.zoom = d3.zoom().on("zoom", function () {
      inner.attr("transform", d3.event.transform);
    });

    this.svg.call(this.zoom);

    this.target = options.element;
    this.updateCount = 0;
    this.windowsLoaded = 0;
    this.host = options.host;
    if (typeof document !== "undefined") {
      const new_p: HTMLElement = document.createElement("p");
      new_p.appendChild(document.createTextNode("Message:"));
      const new_em: HTMLElement = document.createElement("em");
      this.textNode = document.createTextNode(this.updateCount.toString());
      new_em.appendChild(this.textNode);
      new_p.appendChild(new_em);
      this.target.appendChild(new_p);
    }
  }

  // Settings voor custom happy path
  public enumerateObjectInstances(
    options: EnumerateVisualObjectInstancesOptions
  ): VisualObjectInstanceEnumeration {
    const settings: VisualSettings =
      this.visualSettings || <VisualSettings>VisualSettings.getDefault();
    return VisualSettings.enumerateObjectInstances(settings, options);
  }

  public update(options: VisualUpdateOptions) {
    // Settings visual
    this.visualSettings = VisualSettings.parse<VisualSettings>(
      options.dataViews[0]
    );
    this.relationShipPercentageThreshold = this.visualSettings.graphSettings.relationShipPercentageThreshold;

    // Empty relationships
    this.relationships.clear();

    // Collect data from PowerBI
    let table = options.dataViews[0].table;

    let rowCount = options.dataViews[0].table.rows.length;

    if (options.dataViews[0].metadata.segment) {
      this.textNode.textContent = `Loading more data. ${rowCount} rows loaded so far (over ${this.windowsLoaded} fetches)...`;

      let canFetchMore = this.host.fetchMoreData();
      console.log(canFetchMore);
      if (!canFetchMore) {
        this.textNode.textContent = `Memory limit hit after ${this.windowsLoaded} fetches. We managed to get ${rowCount} rows.`;
      }
      return canFetchMore;
    } else {
      this.textNode.textContent = `We have all the data we can get (${rowCount} rows over ${this.windowsLoaded} fetches)!`;
    }
    this.fillRelationships(table);
    this.plotGraph(table, options);
  }

  public fillRelationships(table: powerbi.DataViewTable) {
    let caseId, from, to, ihp, duration;
    let happyPath = [];

    table.rows.forEach((row) => {
      caseId = row[1];
      from = row[2].toString();
      to = row[3].toString();
      // ihp = row[4].toString().toLowerCase() === "yes";
      ihp = row[4];
      duration = +row[5];
      let key = from + "," + to;
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
          caseIds: [caseId],
          durations: [duration],
        });
      } else {
        let rel = this.relationships.get(key);
        rel.amount++;
        rel.caseIds.push(caseId);
        rel.durations.push(duration);
      }
    });
    happyPath.forEach((key) => {
      this.relationships.get(key).isHappyPath = true;
    });
  }

  public plotGraph(table: powerbi.DataViewTable, options: VisualUpdateOptions) {
    let caseIds = [];
    let allActivities = [];

    table.rows.forEach((row) => {
      caseIds.push(row[1]);
    });
    caseIds = [...new Set(caseIds)];

    // Create input graph
    var g = new dagreD3.graphlib.Graph()
      .setGraph({})
      .setDefaultEdgeLabel(function () {
        return {};
      });

    // const uniqueIDs = table.rows
    //   .map((row) => row[1])
    //   .filter((v, i, a) => a.indexOf(v) === i);

    // Plot graph
    this.relationships.forEach((rel) => {
      let percentageRel = Math.round((rel.amount / caseIds.length) * 100);

      allActivities.push(rel.from);
      allActivities.push(rel.to);

      g.setEdge(rel.from, rel.to, {
        style: rel.isHappyPath
          ? "stroke: black; stroke-width: 3px;"
          : "stroke: #262626; stroke-dasharray: 7, 5;",
        arrowheadStyle: rel.isHappyPath ? "fill: black;" : "fill: #262626;",
        label: `${percentageRel}% (${rel.amount}/${
          caseIds.length
        }) AND mean duration = ${Math.round(
          this.calculateDurationStatistics(rel.durations)
        )}`,
        labelStyle: "fill: black; color: black;",
        curve: d3.curveBasis,
      });
    });

    // Set nodes which have been seen
    allActivities = [...new Set(allActivities)];
    for (let i = 0; i < allActivities.length; i++) {
      g.setNode(allActivities[i], {
        label: `${allActivities[i]}`,
      });
    }

    // Create renderer
    var render = new dagreD3.render();

    // Draw final graph
    render(d3.select("svg g"), g);

    // Change viewport dimensions and  center the graph
    this.svgContainer.attr("width", options.viewport.width);

    var initialScale = 0.75;
    this.svg.call(
      this.zoom.transform,
      d3.zoomIdentity
        .translate(
          (+this.svg.attr("width") - g.graph().width * initialScale) / 2,
          20
        )
        .scale(initialScale)
    );
    this.svg.attr("height", g.graph().height * initialScale + 40);

    this.svgContainer.attr("height", options.viewport.height);
  }

  private calculateDurationStatistics(durations: Array<number>) {
    var total = 0;
    for (var i = 0; i < durations.length; i++) {
      total += durations[i];
    }
    return total / durations.length;
  }
}
