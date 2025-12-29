
const fs = require('fs');
const path = 'connectors/database/supabase.mjs';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Fix getAllUserConfigs
    content = content.replace(
        `			if (!this.supabase) return this.newAnswer([]);
			const { data, error } = await this.supabase
				.from('awi_configs')`,
        `			const client = this.admin || this.supabase;
			if (!client) return this.newAnswer([]);
			const { data, error } = await client
				.from('awi_configs')`
    );

    // Fix getAllNamedConfigs
    content = content.replace(
        `			if (!this.supabase) return this.newAnswer([]);
			const { data, error } = await this.supabase
				.from('awi_named_configs')`,
        `			const client = this.admin || this.supabase;
			if (!client) return this.newAnswer([]);
			const { data, error } = await client
				.from('awi_named_configs')`
    );

    fs.writeFileSync(path, content, 'utf8');
    console.log('Successfully patched supabase.mjs');
} catch (e) {
    console.error('Error patching file:', e);
    process.exit(1);
}
