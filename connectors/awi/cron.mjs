/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [  ][   ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
* (_)|____| |____|\__/\__/ [_| |_] \     link:
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file cron.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Cron connector for scheduling tasks
*
*/
import ConnectorBase from '../../connector.mjs'
export { ConnectorCron as Connector }

class ConnectorCron extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Cron';
		this.token = 'cron';
		this.className = 'ConnectorCron';
		this.group = 'awi';
		this.version = '0.5';
		this.tasks = [];
		this.timers = {};
		this.initialized = false;
	}
	async connect( options )
	{
		await super.connect( options );

		var tableExists = await this.ensureTableExists();		
		if (tableExists.isError())
			return this.setConnected( false );
		var tasks = await this.cleanupAndLoadTasks();
		if (tasks.isError())
			return this.setConnected( false );
		this.tasks = tasks.data;
		var initializedTasks = await this.initializeTimers();
		if (initializedTasks.isError())
			return this.setConnected( false );
		this.connectMessage = '\n.... Initialized ' + initializedTasks.data + ' tasks.';
		this.initialized = true;
		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		this.editor = args.editor;
		this.userName = args.userName;

		var data = {};
		data[ this.token ] = {
			self: this,
			version: this.version,
			commands: {
				createTask: this.command_createTask.bind(this),
				cancelTask: this.command_cancelTask.bind(this),
				listTasks: this.command_listTasks.bind(this)
			}
		}
		return this.newAnswer( data );
	}

	// Ensure the cron_tasks table exists in Supabase
	async ensureTableExists() 
	{
		try 
		{
			const { data, error } = await this.awi.database.supabase
				.from('cron_tasks')
				.select('id')
				.limit(1);			
			if (!error) 
				return this.newAnswer( data );
			return this.newError( { message: 'cron:table-does-not-exist' }, { stack: new Error().stack } );
		} 
		catch (error) 
		{
			return this.newError( { message: 'cron:table-does-not-exist', data: error }, { stack: new Error().stack } );
		}
	}

	// Load all tasks from the database
	async loadTasks() 
	{
		const result = await this.awi.database.queryRecords({
			table: 'cron_tasks',
			columns: '*',
			filters: [],
			orderBy: 'execution_time',
			orderDirection: 'asc'
		});		
    return result;
	}

	// Clean up old tasks that have already passed
	async cleanupAndLoadTasks() 
	{
		const now = new Date().getTime();
		const result = await this.awi.database.deleteRecord({
			table: 'cron_tasks',
			filters: [
				{ column: 'execution_time', operator: 'lt', value: now }
			]
		});		
		return await this.loadTasks();
	}

	// Initialize timers for all active tasks
	async initializeTimers() 
	{
		Object.keys(this.timers).forEach(id => {
			clearTimeout(this.timers[id]);
			delete this.timers[id];
		});
		var count = 0;
		const now = new Date().getTime();
		this.tasks.forEach(task => {
			const executionTime = new Date(task.execution_time).getTime();
			const delay = executionTime - now;
			count++;			
			if (delay > 0) {
				var minutes = Math.floor(delay / 60000) + 1;
				console.log(`Setting timer for task ${task.description} to execute in ${minutes} minutes`);
				this.timers[task.id] = setTimeout(() => this.executeTask(task), delay);
			}
		});
    return this.newAnswer(count);
	}

	// Execute a scheduled task
	async executeTask(task) 
	{
		const [connectorName, commandName] = task.connector_token.split(':');			
		await this.deleteTask(task.id, task.description);
		const connector = this.awi[connectorName];
		if (!connector) {
			console.log(`Connector ${connectorName} not found`);
			return;
		}			
		const parameters = JSON.parse(task.parameters);
		console.log(`Executing task ${task.description}`);
		await connector[commandName](parameters);
	}

	// Delete a task from the database and clear its timer
	async deleteTask(taskId, description) 
	{
		if (this.timers[taskId]) {
			clearTimeout(this.timers[taskId]);
			delete this.timers[taskId];
		}			
		const result = await this.awi.database.deleteRecord({
			table: 'cron_tasks',
			filters: [
				{ column: 'id', operator: 'eq', value: taskId }
			]
		});
		description = description || taskId;
		if (result.isError())
			console.log(`Error deleting task ${description}:`, result.getError());
		else {
			console.log(`Deleted task ${description}`);
			this.tasks = this.tasks.filter(task => task.id !== taskId);
		}
	}

	// Create a new task
	async command_createTask(parameters, message, editor) 
	{
		if (!parameters.connector_token)	
			return this.replyError(this.newError({ message: 'cron:missing-connector-token', data: parameters.connector_token }, { stack: new Error().stack }), message, editor);		
		if (!parameters.execution_time && !parameters.delay_ms)
			return this.replyError(this.newError({ message: 'cron:missing-execution-time', data: parameters.execution_time }, { stack: new Error().stack }), message, editor);
		
		let executionTime;
		if (parameters.execution_time) {
			executionTime = new Date(parameters.execution_time).getTime();
		} else {
			executionTime = new Date().getTime() + parameters.delay_ms;
		}
		const result = await this.awi.database.insertRecord({
			table: 'cron_tasks',
			record: {
				connector_token: parameters.connector_token,
				parameters: JSON.stringify(parameters.parameters || {}),
				execution_time: executionTime,
				created_at: new Date().getTime(),
				description: parameters.description || ''
			}
		});		
		if (result.isError()) 
			return this.replyError(result, message, editor);
		
		this.tasks.push(result.data);
		const now = new Date().getTime();
		const delay = executionTime - now;		
		if (delay > 0)
			this.timers[result.data.id] = setTimeout(() => this.executeTask(result.data), delay);	
		var minutes = Math.floor(delay / 60000);
		console.log(`Created task ${parameters.description} in ${minutes} minutes`);
		return this.replySuccess(this.newAnswer(result.data), message, editor);
	}

	// Cancel a scheduled task
	async command_cancelTask(parameters, message, editor) 
	{
		if (!parameters.task_id) 
			return this.replyError(this.newError({ message: 'cron:missing-task-id', data: parameters.task_id }, { stack: new Error().stack }), message, editor);			
		await this.deleteTask(parameters.task_id);
		return this.replySuccess(this.newAnswer({ success: true }), message, editor);
	}

	// List all scheduled tasks
	async command_listTasks(parameters, message, editor) 
	{
		let filteredTasks = this.tasks;
		if (parameters.connector_token) 
			filteredTasks = this.tasks.filter(task => task.connector_token === parameters.connector_token);		
		return this.replySuccess(this.newAnswer(filteredTasks), message, editor);
	}

	// Clean up when connector is being shut down
	async quit() 
	{
		Object.keys(this.timers).forEach(id => {
			clearTimeout(this.timers[id]);
		});
		this.timers = {};
	}
}
