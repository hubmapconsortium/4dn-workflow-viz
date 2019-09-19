'use strict';

import React from 'react';
import _ from 'underscore';

import { console, object } from '../../shared-portal-components/components/util';
import { ItemDetailList } from '../../shared-portal-components/components/ui/ItemDetailList';

import { WorkflowDetailPane } from './components/WorkflowDetailPane';
import DefaultItemView from './DefaultItemView';

import { commonGraphPropsFromProps, doValidAnalysisStepsExist, WorkflowGraphSection } from './WorkflowView';

// Test/Debug Data
//import { WFR_JSON } from './../testdata/traced_workflow_runs/WorkflowRunSBG-4DNWF06BPEF2';
//import { WFR_JSON } from './../testdata/workflow_run/awsem-bad-output-file';
//import { WFR_JSON } from './../testdata/workflow_run/awsem-dupe-post-alignment';


/**
 * N.B. CAUSES SIDE EFFECTS (PURPOSELY)
 * Replaces n.meta.run_data.file UUID with embedded object from input_files or output_files, or output_quality_metrics (assuming they are in param uuidFileMap).
 * Adjusts the node in array of passed in nodes, does NOT return a copy of node. This is so  Edge will maintain reference to its nodes rather than needing to reconnect edge to a copied/new node.
 *
 * @param {Object[]} nodes - List of all nodes for Workflow Graph Viz, e.g. as generated by parseAnalysisSteps func.
 * @param {Object.<Object>} uuidFileMap - Mapping of UUIDs to File Item objects. Should be derived from input_files, output_files, output_quality_metrics.
 * @returns {Object[]} List of nodes with their 'meta.run_data.file' value replaced from UUID to File item object.
 */
export function mapEmbeddedFilesToStepRunDataIDs(nodes, uuidFileMap){

    return _.map(nodes, function(n){
        if (!n.meta || !n.meta.run_data || !n.meta.run_data.file) return n;
        if (typeof n.meta.run_data.file !== 'string') return n;

        var fileUUID;
        try {
            fileUUID = object.assertUUID(n.meta.run_data.file);
        } catch (e) {
            console.error(e);
            return n;
        }

        var matchingFile = uuidFileMap[fileUUID];
        if (matchingFile && typeof matchingFile === 'object'){
            n.meta.run_data = _.extend({}, n.meta.run_data, {
                'file' : matchingFile
            });
        }
        return n;
    });
}

/**
 * Given a WorkflowRun item, looks at its 'input_files', 'output_files', etc. lists and generates an Object
 * with file/item UUIDs as keys and the file/Item object embedded (from WorkflowRun embedded list) representation as value.
 *
 * @param {{ 'input_files' : Object[], 'output_files' : Object[] }} item - The WorkflowRun from which we're grabbing embedded files.
 * @returns {Object} Object keyed by embedded file/qc/report UUID and with embedded Item representation of that UUID as value.
 */
export function allFilesForWorkflowRunMappedByUUID(item){
    return _.object(
        _.map(
            _.filter(
                (item.output_files || []).concat(item.input_files || []),
                function(fileContainer){
                    var file = fileContainer.value || fileContainer.value_qc || null; // quality_metrics would be present under value_qc.
                    if (!file || typeof file !== 'object') {
                        console.error("No file ('value' property) embedded for: ", fileContainer);
                        return false;
                    }
                    if (typeof file.uuid !== 'string' && typeof file.error === 'string'){
                        console.error('Error on file for argument ' + (fileContainer.workflow_argument_name || 'Unknown') + ': ' + file.error);
                        return false;
                    }
                    if (typeof file.uuid !== 'string') {
                        throw new Error("We need to have Files' UUID embedded in WorkflowRun-> output_files, input_files, & output_quality_metric in order to have file info appear on workflow viz nodes."); // This actually shouldn't ever occur as we get UUIDs embedded by default now, yes?
                    }
                    return true;
                }
            ),
            function(fileContainer){
                var file = fileContainer.value || fileContainer.value_qc || null;
                return [
                    file.uuid,                                  // Key
                    _.extend({}, file, {                        // Value
                        '@id' : object.itemUtil.atId(file)      // Outdated way to get @id. Keep for now just for heck of it.
                    })
                ];
            }
        )
    );
}


export default class WorkflowRunView extends DefaultItemView {

    constructor(props){
        super(props);
        this.getTabViewContents = this.getTabViewContents.bind(this);
        this.state = {
            'mounted' : false
        };
    }

    componentDidMount(){
        this.setState({ 'mounted' : true });
    }

    getTabViewContents(){
        const { context, windowHeight } = this.props;
        const width   = this.getTabViewWidth();
        const tabs    = !doValidAnalysisStepsExist(context.steps) ? [] : [
            {
                tab : <span><i className="icon icon-sitemap icon-rotate-90 icon-fw"/> Graph & Summary</span>,
                key : 'graph',
                content : <GraphSection {...this.props} mounted={this.state.mounted} width={width} />
            }
        ];

        tabs.push(ItemDetailList.getTabObject(this.props));

        return _.map(tabs, (tabObj) => // Common properties
            _.extend(tabObj, {
                'style' : { 'minHeight' : Math.max((this.state.mounted && windowHeight - 300) || 0, 600) }
            })
        );
    }

    typeInfo(){
        // TODO: Get rid of this and show a link + maybe more info inside the page body / midsection?
        const { context : { workflow = {} } } = this.props;
        let topRightTitle = (workflow.title || workflow.display_title) || null;

        if (topRightTitle && Array.isArray(workflow.category) && workflow.category.length > 0){
            topRightTitle = (
                <React.Fragment>
                    <span className="text-400">{ topRightTitle }</span> ({ workflow.category.join(', ') })
                </React.Fragment>
            );
        }
        return { 'title' : topRightTitle, 'description' : 'Workflow used for this run' };
    }

}

class GraphSection extends WorkflowGraphSection {

    static isNodeDisabled(node){
        if (node.nodeType === 'step') return false;
        if (node && node.meta && node.meta.run_data){
            return false;
        }
        return true;
    }

    constructor(props){
        super(props);
        this.commonGraphProps = this.commonGraphProps.bind(this);
        this.render = this.render.bind(this);
        this.state = _.extend(this.state, {
            'showChart' : 'detail'
        });
    }

    commonGraphProps(){
        const graphData = this.parseAnalysisSteps(); // Object with 'nodes' and 'edges' props.

        const legendItems = _.clone(WorkflowDetailPane.Legend.defaultProps.items);
        // Remove Items which aren't relevant for this context.
        delete legendItems['Current Context'];
        delete legendItems['Group of Similar Files'];
        if (!this.state.showParameters){
            delete legendItems['Input Parameter'];
        }
        if (this.state.showChart === 'basic'){
            delete legendItems['Intermediate File'];
        }

        return _.extend(commonGraphPropsFromProps(
            _.extend({ legendItems }, this.props)
        ), {
            'isNodeDisabled' : GraphSection.isNodeDisabled,
            'nodes' : mapEmbeddedFilesToStepRunDataIDs( graphData.nodes, allFilesForWorkflowRunMappedByUUID(this.props.context) ),
            'edges' : graphData.edges,
            'rowSpacingType' : this.state.rowSpacingType
        });
    }

}
