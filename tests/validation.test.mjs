import test from 'node:test'
import assert from 'node:assert/strict'
import {safeImageUrl,validStockDelta} from '../src/lib/validation.mjs'
test('afbeeldingen accepteren alleen geldige HTTPS-links',()=>{assert.equal(safeImageUrl('javascript:alert(1)'), '');assert.equal(safeImageUrl('http://example.com/a.jpg'),'');assert.equal(safeImageUrl('https://example.com/a.jpg'),'https://example.com/a.jpg');assert.equal(safeImageUrl('geen link'),'')})
test('voorraad kan niet negatief, fractioneel of te groot worden',()=>{assert.equal(validStockDelta(3,-4),false);assert.equal(validStockDelta(3,-3),true);assert.equal(validStockDelta(3,0),false);assert.equal(validStockDelta(3,1.5),false);assert.equal(validStockDelta(2147483647,1),false);assert.equal(validStockDelta(3,5),true)})
import {passwordProblem,validEmail} from '../src/lib/validation.mjs'
test('wachtwoorden zijn lang genoeg en komen overeen',()=>{assert.notEqual(passwordProblem('kort','kort'),'');assert.notEqual(passwordProblem('lang genoeg','anders!!'),'');assert.notEqual(passwordProblem('x'.repeat(73),'x'.repeat(73)),'');assert.equal(passwordProblem('lang genoeg','lang genoeg'),'')})
test('e-mailadressen voor het journal worden gecontroleerd',()=>{assert.equal(validEmail('a@b.be'),true);assert.equal(validEmail(' a@b.be '),true);assert.equal(validEmail('geen-mail'),false);assert.equal(validEmail('a@b'),false);assert.equal(validEmail('a b@c.be'),false);assert.equal(validEmail('a@'+'b'.repeat(260)+'.be'),false)})
