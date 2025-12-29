/** --------------------------------------------------------------------------
*
*            / \
*          / _ \               (°°)       Intelligent
*        / ___ \ [ \ [ \  [ \ [   ]       Programmable
*     _/ /   \ \_\  \/\ \/ /  |  | \      Personal
* (_)|____| |____|\__/\__/  [_| |_] \     Assistant
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file setup.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Setup: Interactive wizard to configure AWI credentials
*
*/
import BubbleBase from '../../bubble.mjs'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export { BubbleSetup as Bubble }

class BubbleSetup extends BubbleBase
{
	constructor( awi, config = {} )
	{
		super( awi, config,
		{
			name: 'Setup',
			token: 'setup',
			className: 'BubbleSetup',
			group: 'awi',
			version: '0.5',
			action: 'configure system credentials interactively',
			inputs: [],
			outputs: []
		} );
	}

	async play( args, basket, control )
	{
		await super.play( args, basket, control );
		
		control.editor.print( [
			'',
			'--------------------------------------------------------------------',
			'  AWI SETUP WIZARD',
			'--------------------------------------------------------------------',
			'  I will help you configure your database connection.',
			'  You need a Supabase project URL and Secret Key.',
			''
		], { user: 'awi' } );

		// 1. Get Credentials
		const inputs = [
			{ name: 'url', description: 'your Supabase URL (e.g. https://xyz.supabase.co)', type: 'string', optional: false },
			{ name: 'key', description: 'your Supabase Service Role Key (starts with eyJ...)', type: 'string', optional: false }
		];

		const answers = await this.awi.prompt.getParameters( { list: inputs, args: {} }, basket, control );
		
		if ( answers.isError() )
			return answers;

		const data = answers.getValue();
		const url = data.url.result.trim();
		const key = data.key.result.trim();

		// 2. Test Connection
		control.editor.print( 'Testing connection...', { user: 'awi' } );
		
		// Temporarily set for this session
		process.env.SUPABASE_URL = url;
		process.env.SUPABASE_SECRET_KEY = key;
		
		// Attempt to reconnect database
		if ( this.awi.database )
		{
			const connectResult = await this.awi.database.connect({ url, secretKey: key });
			if ( connectResult.isError() || !this.awi.database.supabase )
			{
				control.editor.print( 'Connection failed! Please check your keys.', { user: 'error' } );
				return this.newError( { message: 'setup:connection-failed' } );
			}
		}

		control.editor.print( 'Connection successful!', { user: 'success' } );

		// 3. Save to .env
		// We always use .env in the root.
		
		const rootDir = process.cwd();
		let targetEnv = '.env';
		
		const envPath = path.join(rootDir, targetEnv);
		
		control.editor.print( `Saving configuration to ${targetEnv}...`, { user: 'awi' } );

		try
		{
			let content = '';
			if (fs.existsSync(envPath))
				content = fs.readFileSync(envPath, 'utf8');
			
			// Simple parsing to replace or append
			const lines = content.split('\n');
			let urlFound = false;
			let keyFound = false;
			
			const newLines = lines.map(line => {
				if (line.trim().startsWith('SUPABASE_URL=')) {
					urlFound = true;
					return `SUPABASE_URL=${url}`;
				}
				if (line.trim().startsWith('SUPABASE_SECRET_KEY=')) {
					keyFound = true;
					return `SUPABASE_SECRET_KEY=${key}`;
				}
				return line;
			});

			if (!urlFound) newLines.push(`SUPABASE_URL=${url}`);
			if (!keyFound) newLines.push(`SUPABASE_SECRET_KEY=${key}`);

			fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
			control.editor.print( 'Configuration saved.', { user: 'success' } );
		}
		catch(e)
		{
			control.editor.print( `Could not write to ${targetEnv}: ${e.message}`, { user: 'error' } );
			control.editor.print( 'Please manually update your .env file.', { user: 'warning' } );
		}

		return this.newAnswer( { success: true }, 'setup:complete' );
	}
}
