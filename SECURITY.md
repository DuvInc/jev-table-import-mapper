# Security policy

## Reporting a vulnerability

Please report privately rather than in a public issue, using GitHub's
[private vulnerability reporting](https://github.com/DuvInc/jev-table-import-mapper/security/advisories/new)
on this repository.

This is a one-person project. You should get an acknowledgement within a few
days; if a week passes with no reply, feel free to nudge by opening a public
issue that says only that you are waiting on a private report, with no details.

## What is in scope

This library reads a file somebody uploaded and sends part of it to a third
party API. The interesting surface:

- **Key handling.** Anything that causes `OPENROUTER_API_KEY` to be written to
  a tracked file, printed to output, served to the browser, or sent anywhere
  other than the configured endpoint. `lib/jev.mjs` is the only file that
  should ever read it.
- **What leaves the machine.** Column names and three sample values per column,
  and nothing else. Data rows stay where they are. A change that sends more
  than that, or sends it somewhere else, is in scope whether or not it is
  exploitable, because the data belongs to somebody who never agreed to it.
- **Untrusted input.** Column names and cell values come from a file a stranger
  uploaded. They end up in a JSON payload and, in the demo, in the DOM. The
  demo builds nodes with `textContent`, never `innerHTML`, on anything that
  came from a file. A change that interpolates uploaded text into markup is the
  bug to look for.
- **Path handling in the demo server.** `/api/sample` and the static handler
  both sit in front of the filesystem. `.env` is one directory above the served
  roots.

## What is out of scope

- OpenRouter and TypeSafe AI themselves. Report those to their operators.
- Mapping quality. A wrong column is a bug, not a vulnerability.
- Denial of service through a very wide file. Column count drives cost
  quadratically, which is documented; rate limiting belongs in the host
  product.
- A vulnerability that requires the attacker to already have commit access, or
  to already be able to run code as you.

## If you embedded this in a product

Two things this repository cannot do for you:

- **Hold the key.** The demo keeps it server side. Any design where the browser
  calls the decision endpoint directly ships your key to every user.
- **Decide what may be sent.** Three values per column is small, and it is
  still real data from a real file. If your users upload regulated or personal
  data, that transfer is yours to permit, document or refuse.

## If you forked this tool

Replace the link above with your own repository. This file arrived with the
code and points at somebody else's advisories.
