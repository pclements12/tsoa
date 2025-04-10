import { expect } from 'chai';
import 'mocha';
import { Tsoa } from '@tsoa/runtime';
import { DefaultRouteGenerator } from '@tsoa/cli/routeGeneration/defaultRouteGenerator';

describe('RouteGenerator', () => {
  describe('.buildModels', () => {
    it('should produce models where additionalProperties are not allowed unless explicitly stated', () => {
      // Arrange
      const stringType: Tsoa.Type = {
        dataType: 'string',
      };
      const refThatShouldNotAllowExtras = 'refThatShouldNotAllowExtras';
      const refWithExtraStrings = 'refWithExtraStrings';
      const generator = new DefaultRouteGenerator(
        {
          controllers: [],
          referenceTypeMap: {
            [refThatShouldNotAllowExtras]: {
              dataType: 'refObject',
              properties: [
                {
                  name: 'aStringOnTheObject',
                  required: true,
                  type: stringType,
                  validators: {},
                  deprecated: false,
                },
              ],
              refName: refThatShouldNotAllowExtras,
              deprecated: false,
            },
            [refWithExtraStrings]: {
              additionalProperties: stringType,
              dataType: 'refObject',
              properties: [],
              refName: refThatShouldNotAllowExtras,
              deprecated: false,
            },
          },
        },
        {
          bodyCoercion: true,
          entryFile: 'mockEntryFile',
          routesDir: 'mockRoutesDir',
          noImplicitAdditionalProperties: 'silently-remove-extras',
        },
      );

      // Act
      const models = generator.buildModels();

      // Assert
      const strictModel = models[refThatShouldNotAllowExtras];
      if (!strictModel) {
        throw new Error(`.buildModels should have created a model for ${refThatShouldNotAllowExtras}`);
      }
      if (strictModel.dataType !== 'refObject') {
        throw new Error(`Expected strictModel.dataType to be refObject`);
      }
      expect(strictModel.additionalProperties).to.equal(false);
      const stringDictionaryModel = models[refWithExtraStrings];
      if (!stringDictionaryModel) {
        throw new Error(`.buildModels should have created a model for ${refWithExtraStrings}`);
      }
      if (stringDictionaryModel.dataType !== 'refObject') {
        throw new Error(`.buildModels should have created a model for ${refThatShouldNotAllowExtras}`);
      }
      expect(stringDictionaryModel.additionalProperties).to.deep.equal({
        dataType: stringType.dataType,
      });
    });
  });

  describe('.buildContent', () => {
    it('strips .ts from the end of module paths but not from the middle', () => {
      const generator = new DefaultRouteGenerator(
        {
          controllers: [
            {
              location: 'controllerWith.tsInPath.ts',
              methods: [],
              name: '',
              path: '',
            },
          ],
          referenceTypeMap: {},
        },
        {
          bodyCoercion: true,
          entryFile: 'mockEntryFile',
          routesDir: '.',
          noImplicitAdditionalProperties: 'silently-remove-extras',
        },
      );

      const models = generator.buildContent('{{#each controllers}}{{modulePath}}{{/each}}');

      expect(models).to.equal('./controllerWith.tsInPath');
    });

    it('adds js for routes if esm is true', () => {
      const generator = new DefaultRouteGenerator(
        {
          controllers: [
            {
              location: 'controller.ts',
              methods: [],
              name: '',
              path: '',
            },
          ],
          referenceTypeMap: {},
        },
        {
          bodyCoercion: true,
          entryFile: 'mockEntryFile',
          routesDir: '.',
          noImplicitAdditionalProperties: 'silently-remove-extras',
          esm: true,
        },
      );

      const models = generator.buildContent('{{#each controllers}}{{modulePath}}{{/each}}');

      expect(models).to.equal('./controller.js');
    });

    it('adds mjs for routes if esm is true and source is mts', () => {
      const generator = new DefaultRouteGenerator(
        {
          controllers: [
            {
              location: 'controller.mts',
              methods: [],
              name: '',
              path: '',
            },
          ],
          referenceTypeMap: {},
        },
        {
          bodyCoercion: true,
          entryFile: 'mockEntryFile',
          routesDir: '.',
          noImplicitAdditionalProperties: 'silently-remove-extras',
          esm: true,
        },
      );

      const models = generator.buildContent('{{#each controllers}}{{modulePath}}{{/each}}');

      expect(models).to.equal('./controller.mjs');
    });

    it('adds cjs for routes if esm is true and source is cts', () => {
      const generator = new DefaultRouteGenerator(
        {
          controllers: [
            {
              location: 'controller.cts',
              methods: [],
              name: '',
              path: '',
            },
          ],
          referenceTypeMap: {},
        },
        {
          bodyCoercion: true,
          entryFile: 'mockEntryFile',
          routesDir: '.',
          noImplicitAdditionalProperties: 'silently-remove-extras',
          esm: true,
        },
      );

      const models = generator.buildContent('{{#each controllers}}{{modulePath}}{{/each}}');

      expect(models).to.equal('./controller.cjs');
    });

    it('uses ts for routes if esm is true and rewriteRelativeImportExtensions is true', () => {
      const generator = new DefaultRouteGenerator(
        {
          controllers: [
            {
              location: 'controller.ts',
              methods: [],
              name: '',
              path: '',
            },
          ],
          referenceTypeMap: {},
        },
        {
          bodyCoercion: true,
          entryFile: 'mockEntryFile',
          routesDir: '.',
          noImplicitAdditionalProperties: 'silently-remove-extras',
          esm: true,
          rewriteRelativeImportExtensions: true,
        },
      );

      const models = generator.buildContent('{{#each controllers}}{{modulePath}}{{/each}}');

      expect(models).to.equal('./controller.ts');
    });

    it('uses mts for routes if rewriteRelativeImportExtensions and esm is true and source is mts', () => {
      const generator = new DefaultRouteGenerator(
        {
          controllers: [
            {
              location: 'controller.mts',
              methods: [],
              name: '',
              path: '',
            },
          ],
          referenceTypeMap: {},
        },
        {
          bodyCoercion: true,
          entryFile: 'mockEntryFile',
          routesDir: '.',
          noImplicitAdditionalProperties: 'silently-remove-extras',
          esm: true,
          rewriteRelativeImportExtensions: true,
        },
      );

      const models = generator.buildContent('{{#each controllers}}{{modulePath}}{{/each}}');

      expect(models).to.equal('./controller.mts');
    });
  });
});
