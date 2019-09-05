import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import * as serviceWorker from './serviceWorker';
import WorkflowRunView from './components/item-pages/WorkflowRunView';
import WorkflowView from './components//item-pages/WorkflowView';
import App from './App';

let workflow_output = '';//require('./static-workflow-output.json');
let context = {
	'steps': workflow_output
};

ReactDOM.render(
	<App context={context}/>,
	document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
