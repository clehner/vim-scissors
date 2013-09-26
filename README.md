# vim-scissors

Live edit CSS (and LESS) in Vim.

## Usage

- Add the script to your web page:

    ```
<script src="http://localhost:3219/scissors.js"></script>
    ```

- Start the **vim-scissors** server:

    `npm start`

- Open the page in your browser.

- Execute `:nbs` in vim (or run `vim -nb`)

  Your CSS/LESS files should then open in the vim session.

  For best results, run vim from your web root directory.

- Edit styles in vim. Watch the changes appear in the browser.

- Rejoice!

## Slightly More Advanced Usage 

Run vim-scissors on your web server instead of localhost, to make it easier to
use from browsers on multiple machines.

- Add the full snippet to your web pages:

	```
	<script>document.write('<script src="http://' + (location.host ||
		'localhost').split(':')[0] +
		':3219/scissors.js"></' + 'script>')</script>
	```

- Run vim-scissors from the machine that is serving your website.

    `npm start`

- Connect vim using `:nbs:[host]` where host is the domain name of the server
  running vim-scissors.

## Todo

- Allow specifying a site or filename filter in the `nbs` connection command,
  for situations where you are using vim-scissors for more than one site.
- Handle more CSS, including media queries and imports.
- Make a browser extension to add the script tag, or integrate with an existing
  extension, such as LiveReload.
- Clean up code for diffing CSS. Factor out code common to both client and
  server.

## License

[MIT License](http://cel.mit-license.org/)
