import * as React from 'react';
import { renderToNodeStream } from 'react-dom/server';

import { createCriticalStyleStream, parseProjectStyles } from '../src';

describe('React css stream', () => {
  const file1 = `
    .a, .b, .input { color: rightColor }
  `;

  let lookup: any;

  beforeAll(() => {
    lookup = parseProjectStyles({
      file1,
    });
  });

  describe('React.renderToStream ', () => {
    it('render with small style tag', async () => {
      const streamString = async (readStream: NodeJS.ReadableStream) => {
        const result = [];

        for await (const chunk of readStream) {
          result.push(chunk);
        }

        return result.join('');
      };

      const criticalStream = createCriticalStyleStream(lookup);

      const output = renderToNodeStream(
        <>
          <div className="a">
            <style>{Array(5).fill('.xxxxx { color: red; }').join('\n')}</style>
            <div className="b"></div>
          </div>
        </>
      );

      let htmlCritical = '';
      const _htmlCritical = streamString(output.pipe(criticalStream));

      htmlCritical = await _htmlCritical;

      // should not include nested styles
      expect(htmlCritical.includes('<style><style')).toBe(false);
    });

    it('render with large style tag', async () => {
      const streamString = async (readStream: NodeJS.ReadableStream) => {
        const result = [];

        for await (const chunk of readStream) {
          result.push(chunk);
        }

        return result.join('');
      };

      const criticalStream = createCriticalStyleStream(lookup);

      const output = renderToNodeStream(
        <>
          <div className="a">
            <style>{Array(1000).fill('.xxxxx { color: red; }').join('\n')}</style>
            <div className="b"></div>
          </div>
        </>
      );

      let htmlCritical = '';
      const _htmlCritical = streamString(output.pipe(criticalStream));

      htmlCritical = await _htmlCritical;

      // should not include nested styles
      expect(htmlCritical.includes('<style><style')).toBe(false);
      expect(htmlCritical.includes('</style></style')).toBe(false);
    });
  });
});
