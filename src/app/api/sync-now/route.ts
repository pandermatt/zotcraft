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

        // 1. Fetch items
        const items = await zoteroClient.getCollectionItems(maxItems);

        for (const item of items) {
            const itemTitle = item.data.title || 'Untitled';

            try {
                // 2. Check if already exists in Craft
                const exists = await craftClient.checkItemExists(craft.targetCollectionId, itemTitle);

                if (exists) {
                    logs.push({ title: itemTitle, status: 'skipped', details: 'Already exists in Craft' });
                    continue;
                }

                // 3. Prepare content
                const creators = ZoteroClient.formatAuthors(item.data.creators);
                const year = ZoteroClient.extractYear(item.data.date);
                const journal = item.data.publicationTitle || '';
                const url = item.data.url || item.data.DOI || '';

                // Format tags: #tag_name
                const rawTags = item.data.tags || [];
                const formattedTags = rawTags.map((t: any) => {
                    const tagName = t.tag.replace(/\s+/g, '_');
                    return `#${tagName}`;
                });
                const tagsString = formattedTags.join(' ');
                const tags = formattedTags;

                const abstract = item.data.abstractNote || '';

                // 4. Transform to Markdown
                const markdownBody = `
**Authors:** ${creators}
**Year:** ${year}
**Journal:** ${journal}
**Link:** ${url}
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

                // 5. Create in Craft
                if (craft.targetCollectionId) {
                    await craftClient.createCollectionItem(craft.targetCollectionId, itemTitle, markdownBody);
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
