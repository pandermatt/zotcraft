import { NextResponse } from 'next/server';
import { ZoteroClient } from '@/lib/zotero';
import { ZoteroConfig } from '@/types/zotero';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const config = body as ZoteroConfig;

        if (!config.userId || !config.apiKey) {
            return NextResponse.json(
                { error: 'Missing Zotero credentials' },
                { status: 400 }
            );
        }

        const client = new ZoteroClient(config);
        const groups = await client.getGroups();

        return NextResponse.json(groups);
    } catch (error: any) {
        console.error('Error in groups API:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
