import { NextResponse } from 'next/server';
import { ZoteroClient } from '@/lib/zotero';
import { CraftClient } from '@/lib/craft';
import { ZoteroConfig } from '@/types/zotero';
import { CraftConfig } from '@/types/craft';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { config, maxItems = 10 } = body;
        const { zotero, craft } = config as {
            zotero: ZoteroConfig;
            craft: CraftConfig;
        };

        const logs: Array<{ title: string; status: string; details?: string }> = [];

        const zoteroClient = new ZoteroClient(zotero);
        const craftClient = new CraftClient(craft);

        // 1. Fetch schema if target collection is set
        let schemaMap: Record<string, string> = {}; // Name -> Key
        if (craft.targetCollectionId) {
            const schema = await craftClient.getCollectionSchema(craft.targetCollectionId);
            if (schema && schema.properties) {
                schema.properties.forEach((prop: any) => {
                    schemaMap[prop.name] = prop.key;
                });
            }
        }

        // 2. Fetch items
        const items = await zoteroClient.getCollectionItems(maxItems);

        for (const item of items) {
            const itemTitle = item.data.title || 'Untitled';

            try {
                // 3. Check if already exists in Craft
                const exists = await craftClient.checkItemExists(craft.targetCollectionId, itemTitle);

                if (exists) {
                    logs.push({ title: itemTitle, status: 'skipped', details: 'Already exists in Craft' });
                    continue;
                }

                // 4. Prepare content & properties
                const creators = ZoteroClient.formatAuthors(item.data.creators);
                const year = ZoteroClient.extractYear(item.data.date);
                const journal = item.data.publicationTitle || '';
                const url = item.data.url || item.data.DOI || '';
                const dateAdded = item.data.dateAdded ? new Date(item.data.dateAdded).toISOString().split('T')[0] : '';
                const itemType = item.data.itemType || '';

                // Format tags: #tag_name
                const rawTags = item.data.tags || [];
                const formattedTags = rawTags.map((t: any) => {
                    const tagName = t.tag.replace(/\s+/g, '_');
                    return `#${tagName}`;
                });
                const tagsString = formattedTags.join(' ');
                const tags = formattedTags;

                const abstract = item.data.abstractNote || '';

                // Map properties to Craft schema keys
                const properties: Record<string, any> = {};

                // Helper to set property if field exists in schema
                const setProp = (fieldName: string, value: any) => {
                    if (schemaMap[fieldName] && value) {
                        properties[schemaMap[fieldName]] = value;
                    }
                };

                // Map known fields (Robust against missing fields in schema)
                setProp('Authors', creators);
                setProp('Year', year); // Assuming text or number, string should work for both usually
                setProp('Journal', journal);
                setProp('URL', url);
                setProp('Date added', dateAdded);
                setProp('Publication type', itemType);
                // For Tags, if it's a text field, join them. If it's multi-select, might be tricky without options.
                // Assuming it works as text or we just try sending string
                setProp('Tags', tags.join(', '));
                // Also 'Reading status' from CSV - we can set default if needed, or leave empty
                setProp('Reading status', 'To Read');

                // 5. Transform to Markdown
                const markdownBody = `
**Authors:** ${creators}
**Year:** ${year}
**Journal:** ${journal}
**Link:** ${url}
**Date Added:** ${dateAdded}
**Publication Type:** ${itemType}
**Tags:** ${tagsString}

**Abstract:**
${abstract || 'No abstract available.'}

## Key Ideas
- 

## Quotes
- 

## Critique
- 

## Related Work
- 
`;

                // 6. Create in Craft
                if (craft.targetCollectionId) {
                    await craftClient.createCollectionItem(craft.targetCollectionId, itemTitle, markdownBody, properties);
                } else {
                    // Fallback to creating sub-page
                    await craftClient.createNote(itemTitle, markdownBody, tags);
                }

                logs.push({ title: itemTitle, status: 'created' });
            } catch (err: any) {
                console.error(`Error processing item ${item.key}:`, err);
                logs.push({ title: itemTitle, status: 'error', details: err.message });
            }
        }

        return NextResponse.json({ logs });
    } catch (error) {
        console.error('Sync error:', error);
        return NextResponse.json(
            { error: 'Sync process failed' },
            { status: 500 }
        );
    }
}
