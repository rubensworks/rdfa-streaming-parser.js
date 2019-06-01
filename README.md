# RDFa Streaming Parser

[![Build Status](https://travis-ci.org/rubensworks/rdfa-streaming-parser.js.svg?branch=master)](https://travis-ci.org/rubensworks/rdfa-streaming-parser.js)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/rdfa-streaming-parser.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/rdfa-streaming-parser.js?branch=master)
[![npm version](https://badge.fury.io/js/rdfa-streaming-parser.svg)](https://www.npmjs.com/package/rdfa-streaming-parser) [![Greenkeeper badge](https://badges.greenkeeper.io/rubensworks/rdfa-streaming-parser.js.svg)](https://greenkeeper.io/)

A fast and lightweight _streaming_ and 100% _spec-compliant_ [RDFa](https://rdfa.info/) parser,
with [RDFJS](https://github.com/rdfjs/representation-task-force/) representations of RDF terms, quads and triples.

The streaming nature allows triples to be emitted _as soon as possible_, and documents _larger than memory_ to be parsed.

## Installation

```bash
$ npm install rdfa-streaming-parser
```

or

```bash
$ yarn add rdfa-streaming-parser
```

This package also works out-of-the-box in browsers via tools such as [webpack](https://webpack.js.org/) and [browserify](http://browserify.org/).

## Require

```javascript
import {RdfaParser} from "rdfa-streaming-parser";
```

_or_

```javascript
const RdfaParser = require("rdfa-streaming-parser").RdfaParser;
```


## Usage

`RdfaParser` is a Node [Transform stream](https://nodejs.org/api/stream.html#stream_class_stream_transform)
that takes in chunks of JSON-LD data,
and outputs [RDFJS](http://rdf.js.org/)-compliant quads.

It can be used to [`pipe`](https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options) streams to,
or you can write strings into the parser directly.

TODO

## Configuration

Optionally, the following parameters can be set in the `RdfaParser` constructor:

TODO

## How it works

TODO

## Specification Compliance

TODO

## Performance

TODO

## License
This software is written by [Ruben Taelman](http://rubensworks.net/).

This code is released under the [MIT license](http://opensource.org/licenses/MIT).
